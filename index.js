const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 5000;

const app = express();

//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.04tujxe.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        const appointmentOptionCollection = client.db("dentistPortal").collection("appointmentOptions")
        const bookingsCollection = client.db("dentistPortal").collection("bookings")
        app.get('/appointmentOptions',async(req,res)=>{
            const date = req.query.date;
            const query = {};
            const options = await appointmentOptionCollection.find(query).toArray();

            // Show all the booking for probided date
            const bookingQuery = {appointmentDate:date}
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();
            
            // At first take one option at a time
            options.map(option=>{
                // Then find the all booking for this option 
                const optionBookings = alreadyBooked.filter(book=>book.treatment===option.name);
                //Find the all slots from that bookings
                const bookingSlots = optionBookings.map(book=>book.slot);
                
                // the find the remaining slot 
                const remainingSlots = option.slots.filter(slot=>!bookingSlots.includes(slot));
                // assign the remaing slot to the option
                option.slots = remainingSlots;
            })
            res.send(options);


        })


        app.post('/bookings',async(req,res)=>{
            const booking = req.body;
            const query = {
                appointmentDate:booking.appointmentDate,
                email:booking.email,
                treatment:booking.treatment
            }
            const queryBooking = await bookingsCollection.find(query).toArray();
            if(queryBooking.length){
                const message = `You already have ${booking.treatment} booking `
                return res.send({message})
            }
            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        })
        app.get('/bookings',async(req,res)=>{
            const date = req.query.formatedDate;
            const email = req.query.email;
            const query = {
                appointmentDate:date,
                email:email
            }
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings);
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
run().catch(console.log);
app.get('/', async (req, res) => {
    res.send("Dentist portal running")
})

app.listen(port, () => {
    console.log(`Doctor Portal running of ${port}`)
})