const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// You can also find your test secret API key at https://dashboard.stripe.com/test/apikeys.
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const port = process.env.PORT || 3999;
const crypto = require("crypto");

const admin = require("firebase-admin");

const serviceAccount = require("./city-fix-assignment-11-firebase-adminsdk.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

function generateTrackingId() {
  const prefix = "CITY"; // your brand prefix
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
  const random = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-char random hex

  return `${prefix}-${date}-${random}`;
}

// middleware
app.use(express.json());
app.use(cors());

const verifyFBToken = async (req, res, next) => {
  // console.log("in the verify middleware", req.headers.authorization);

  if (!req.headers.authorization) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const idToken = req.headers.authorization.split(" ")[1];
  if (!idToken) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  // verify id token
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
    // console.log("after token verify", decoded);
    next();
  } catch {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@tuser579.arztfp8.mongodb.net/?appName=Tuser579`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("assignment-11");
    const citizens = db.collection("citizenUsers");
    const issues = db.collection("Issues");
    const reviews = db.collection("Reviews");
    const payments = db.collection("paymentCollection");

    // given review
    app.post("/givenReview", async (req, res) => {
      const review = req.body;
      const result = await reviews.insertOne(review);
      res.send(result);
    });

    app.get("/getReview", async (req, res) => {
      const cursor = reviews.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // citizen users
    app.post("/citizensUser", async (req, res) => {
      const citizen = req.body;
      const result = await citizens.insertOne(citizen);
      res.send(result);
    });

    app.get("/singleUser", async (req, res) => {
      const email = req.query.email;
      const query = {};
      query.email = email;
      const result = await citizens.findOne(query);
      res.send(result);
    });

    app.get("/allIssues", async (req, res) => {
      const cursor = issues.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/myIssues", async (req, res) => {
      const email = req.query.email;
      const query = {};
      query.reportedByEmail = email;
      const cursor = issues.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/sixResolvedIssue", async (req, res) => {
      // const cursor = issues.find({ status: "resolved" }).sort({ resolvedDate: -1 }).limit(6);
      const cursor = issues.find().sort({ resolvedDate: -1 }).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/reportIssue", async (req, res) => {
      const issue = req.body;
      const result = await issues.insertOne(issue);
      res.send(result);
    });

    app.patch("/myIssueUpdate/:id", async (req, res) => {
      const id = req.params.id;
      const updatedIssue = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: updatedIssue,
      };
      const options = {};
      const result = await issues.updateOne(query, update, options);
      res.send(result);
    });

    app.patch("/upvoteIssue/:id", async (req, res) => {
      const id = req.params.id;
      const updatedIssue = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          isUpvoted: updatedIssue.isUpvoted,
          upVotes: updatedIssue.upVotes,
        },
      };
      const options = {};
      const result = await issues.updateOne(query, update, options);
      res.send(result);
    });

    app.patch("/userPhotoUpdate/:id", async (req, res) => {
      const id = req.params.id;
      const updatedUser = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          photoURL: updatedUser.photoURL,
        },
      };
      const options = {};
      const result = await citizens.updateOne(query, update, options);
      res.send(result);
    });

    app.patch("/updateUser/:id", async (req, res) => {
      const id = req.params.id;
      // console.log("id" , id);
      const updatedUser = req.body;

      delete updatedUser._id;

      const query = { _id: new ObjectId(id) };
      const update = {
        $set: updatedUser,
      };
      const options = {};
      const result = await citizens.updateOne(query, update, options);
      res.send(result);
    });

    app.delete("/myIssueDelete/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await issues.deleteOne(query);
      res.send(result);
    });

    app.get("/issueDetails/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await issues.findOne(query);
      res.send(result);
    });

    // payments related code
    // old
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "BDT",
              unit_amount: amount,
              product_data: {  
                name: paymentInfo.name,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.email,
        mode: "payment",
        metadata: {
          userId: paymentInfo.userID,
          userName: paymentInfo.name,
          type: paymentInfo.type,
          totalPayment: paymentInfo.totalPayment,
          issueId: paymentInfo.issueId || NULL
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });

      console.log(session);
      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      // console.log("session retrieve", session);
      // console.log("session id", sessionId);

      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };

      const paymentExist = await payments.findOne(query);
      // console.log(paymentExist);
      if (paymentExist) {
        return res.send({
          message: "already exists",
          transactionId,
          trackingId: paymentExist.trackingId,
        });
      }

      const trackingId = generateTrackingId();

      if (session.payment_status === "paid" && session.metadata.type === 'Premium Subscription') {
        const id = session.metadata.userId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            isPremium: true,
            trackingId: trackingId,
            totalPayment: parseInt(session.metadata.totalPayment)
          },
        };
        const result = await citizens.updateOne(query, update);

        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          userId: session.metadata.userId,
          userName: session.metadata.userName,
          type: session.metadata.type,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          trackingId: trackingId,
        };

        if (session.payment_status === "paid") {
          const resultPayment = await payments.insertOne(payment);

          res.send({
            success: true,
            amount: payment.amount,
            type: payment.type,
            currency: payment.currency,
            modifyUser: result,
            trackingId: trackingId,
            transactionId: session.payment_intent,
            paymentInfo: resultPayment,
          });
        }
      }
      else if (session.payment_status === "paid" && session.metadata.type === 'Boost Issue') {
        const id = session.metadata.userId;
        const issueId = session.metadata.issueId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            totalPayment: parseInt(session.metadata.totalPayment)
          },
        };
        const result = await citizens.updateOne(query, update);

        const query1 = { _id: new ObjectId(issueId) };
        const update1 = {
          $set: {
            isBoosted: true
          },
        };
        const result1 = await issues.updateOne(query1, update1);


        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          userId: session.metadata.userId,
          userName: session.metadata.userName,
          type: session.metadata.type,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          trackingId: trackingId,
          issueId: session.metadata.issueId
        };

        if (session.payment_status === "paid") {
          const resultPayment = await payments.insertOne(payment);

          res.send({
            success: true,
            amount: payment.amount,
            type: payment.type,
            currency: payment.currency,
            modifyUser: result,
            trackingId: trackingId,
            transactionId: session.payment_intent,
            paymentInfo: resultPayment,
            issueId: payment.issueId
          });
        }
      }

      res.send({ success: false });
    });

    // payment related apis
    app.get("/myPayments", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const query = {};

      // console.log( 'headers', req.headers);

      if (email) {
        query.customerEmail = email;

        // check email address
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "forbidden access" });
        }
      }
      const cursor = payments.find(query).sort({ paidAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.delete("/myPaymentDelete/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await payments.deleteOne(query);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("CityFix - Public Infrastructure Issue Reporting System");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
