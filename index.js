const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const stripe = require("stripe")(process.env.SECRET_KEY_STRIPE);
const port = process.env.PORT || 5000;
const app = express();

//middleware
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ya6ls2u.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    // Get httpOnly cookie that browser send Atuometic
    const token = req.cookies.jwt;
    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbiden access' })
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {
    try {
        const appointmentOptionCollection = client.db("dentistPortal").collection("appointmentOptions")
        const bookingsCollection = client.db("dentistPortal").collection("bookings")
        const usersCollection = client.db("dentistPortal").collection("users");
        const doctorsCollection = client.db("dentistPortal").collection("doctors");

        // Note: varifyAdmin always use after verifyJWT
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const user = await usersCollection.findOne({ email: decodedEmail })
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            next();
        }



        app.get('/appointmentOptions', async (req, res) => {
            const date = req.query.date;
            const query = {};
            const options = await appointmentOptionCollection.find(query).toArray();

            // Show all the booking for probided date
            const bookingQuery = { appointmentDate: date }
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

            // At first take one option at a time
            options.map(option => {
                // Then find the all booking for this option 
                const optionBookings = alreadyBooked.filter(book => book.treatment === option.name);
                //Find the all slots from that bookings
                const bookingSlots = optionBookings.map(book => book.slot);

                // the find the remaining slot 
                const remainingSlots = option.slots.filter(slot => !bookingSlots.includes(slot));
                // assign the remaing slot to the option
                option.slots = remainingSlots;
            })
            res.send(options);


        })


        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            const query = {
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment
            }
            const queryBooking = await bookingsCollection.find(query).toArray();
            if (queryBooking.length) {
                const message = `You already have ${booking.treatment} booking `
                return res.send({ message })
            }
            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        })
        app.get('/bookings', verifyJWT, async (req, res) => {

            // Verify the user email with token email
            const decodedEmail = req.decoded.email;
            if (req.query.email !== decodedEmail) {
                return res.status(403).send({ message: 'Forbidden Access' })
            }


            const date = req.query.formatedDate;
            const email = req.query.email;
            const query = {
                appointmentDate: date,
                email: email
            }
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings);
        });
        app.get('/booking/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const booking = await bookingsCollection.findOne(query)
            res.send(booking);
        });
        app.get('/bookings/all', verifyJWT, async (req, res) => {

            // Verify the user email with token email
            const decodedEmail = req.decoded.email;
            if (req.query.email !== decodedEmail) {
                return res.status(403).send({ message: 'Forbidden Access' })
            }

            const email = req.query.email;
            const bookings = await bookingsCollection.find({ email }).toArray();
            res.send(bookings);
        })

        app.post('/users', async (req, res) => {
            const { email } = req.body;
            const isAlreadyExist = await usersCollection.findOne({ email });
            if (isAlreadyExist) {
                return res.send({ message: 'Google User' })
            }
            const result = await usersCollection.insertOne(req.body);
            res.send(result);
        });

        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });
        app.get('/user/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = {
                email
            }
            const user = await usersCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            res.send(isAdmin);
        });

        app.put('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });

        //Temporary api for update price in appointment option
        // app.get('/price', async (req, res) => {
        //     const filter = {};
        //     const options = { upsert: true };
        //     const updateDoc = {
        //         $set: {
        //             price: 99
        //         }
        //     }
        //     const result = await appointmentOptionCollection.updateMany(filter, updateDoc, options);
        //     res.send(result)

        // })



        app.delete('/users/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) };
            const result = await usersCollection.deleteOne(query)
            res.send(result);
        });


        // Get jwt token for valid user
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user) {

                // Here create jwt token
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' });

                // This is for set token in httpOnly Cookie
                res.cookie('jwt', token, {
                    sameSite: 'none',
                    httpOnly: true,
                    secure: true, // Enable this option when using HTTPS
                    maxAge: 60 * 60 * 1000 // Set cookie expiration time to 1 hour
                });
                res.send({ accessToken: token })
                return
            }
            res.status(404).send({ accessToken: '' })
        });

        // Payment method in stripe 
        app.post('/create-payment-intent', async (req, res) => {
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                "payment_method_types": [
                    "card"
                ],
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        })

        app.get('/appointmenSpecialty', async (req, res) => {
            const query = {}
            const result = await appointmentOptionCollection.find(query).project({ name: 1 }).toArray();
            res.send(result);
        });

        app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor)
            res.send(result);
        });
        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const query = {}
            const doctors = await doctorsCollection.find(query).toArray();
            res.send(doctors);
        });

        app.delete('/doctors/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await doctorsCollection.deleteOne(query)
            res.send(result);
        })


        /***
         * bookings
         * app.get('/bookings')
         * app.get('/bookings/:id')
         * app.post('/bookings')
         * app.patch('/bookings/id')
         * app.delete('/bookings/id')
         * */


    }
    finally {

    }
}
run().catch(err => console.log(err));
app.get('/', async (req, res) => {
    res.send("Dentist portal running")
})

app.listen(port, () => {
    console.log(`Doctor Portal running of ${port}`)
})