import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import db from "./db.js";

dotenv.config();

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Helper function to send email
const sendEmail = async (to, subject, text) => {
  const mailOptions = {
    from: 'your-email@gmail.com',
    to,
    subject,
    text
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

// Fixed hourly rates per vehicle type
const RATE_MAPPING = {
  car: 5,
  bike: 3,
  truck: 10,
};

// Helper function to get vehicle by plate
const getVehicle = (plate) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM vehicles WHERE plate = ?", [plate], (err, row) => {
      if (err) reject(err);
      if (!row) reject(new Error("Vehicle not found"));
      resolve(row);
    });
  });
};

// Helper function to get active check-in for a vehicle
const getActiveCheckin = (vehicleId) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT c.* 
       FROM checkins c 
       LEFT JOIN checkouts o ON c.id = o.checkin_id 
       WHERE c.vehicle_id = ? AND o.id IS NULL`,
      [vehicleId],
      (err, row) => {
        if (err) reject(err);
        if (!row) reject(new Error("No active check-in found"));
        resolve(row);
      }
    );
  });
};

// Helper function to calculate parking fee based on duration and vehicle type
const calculateFee = (hours, vehicleType) => {
  const rate = RATE_MAPPING[vehicleType.toLowerCase()] || RATE_MAPPING.car;
  return Math.ceil(hours) * rate;
};

// Endpoint: Check in a vehicle (requires plate, type, and email)
app.post("/api/checkin", (req, res) => {
  const { plate, type, email } = req.body;
  if (!plate || !type || !email) {
    return res.status(400).json({ error: "Plate, type, and email are required" });
  }
  // Insert vehicle if not exists; update type and email if vehicle already exists
  db.run(
    `INSERT OR IGNORE INTO vehicles (plate, type, email) VALUES (?, ?, ?)`,
    [plate, type, email],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      db.run(`UPDATE vehicles SET type = ?, email = ? WHERE plate = ?`, [type, email, plate]);
      // Retrieve vehicle id
      db.get(`SELECT id FROM vehicles WHERE plate = ?`, [plate], (err, row) => {
        if (err || !row) {
          return res
            .status(500)
            .json({ error: err ? err.message : "Vehicle not found" });
        }
        const vehicle_id = row.id;
        // Record check-in event
        db.run(
          `INSERT INTO checkins (vehicle_id) VALUES (?)`,
          [vehicle_id],
          function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Vehicle checked in", checkinId: this.lastID });
          }
        );
      });
    }
  );
});

// ...existing code...

app.post("/api/checkout", async (req, res) => {
  const { plate } = req.body;

  try {
    // Get vehicle and check-in info
    const vehicle = await getVehicle(plate);
    const checkin = await getActiveCheckin(vehicle.id);

    // Calculate parking fee
    const duration = new Date() - new Date(checkin.checkin_time);
    const hours = duration / (1000 * 60 * 60);
    const parkingFee = calculateFee(hours, vehicle.type);

    // Get unpaid violations
    const violations = await new Promise((resolve, reject) => {
      db.all(
        `SELECT SUM(fine_amount) as total_fines 
         FROM violations 
         WHERE vehicle_id = ? AND paid = 0`,
        [vehicle.id],
        (err, rows) => {
          if (err) reject(err);
          resolve(rows[0]?.total_fines || 0);
        }
      );
    });

    const totalFee = parkingFee + violations;

    // Create checkout record
    await db.run(
      `INSERT INTO checkouts (vehicle_id, checkin_id, fee)
       VALUES (?, ?, ?)`,
      [vehicle.id, checkin.id, totalFee]
    );

    // Mark violations as paid
    if (violations > 0) {
      await db.run(
        `UPDATE violations 
         SET paid = 1, payment_time = CURRENT_TIMESTAMP 
         WHERE vehicle_id = ? AND paid = 0`,
        [vehicle.id]
      );
    }

    res.json({
      message: "Checkout successful",
      fee: totalFee,
      parkingFee,
      fines: violations,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Endpoint: Get vehicles currently parked (active checkin with no checkout)
app.get("/api/parked", (req, res) => {
  const query = `
    SELECT v.id, v.plate, v.type, c.checkin_time
    FROM vehicles v
    JOIN checkins c ON v.id = c.vehicle_id
    LEFT JOIN checkouts o ON c.id = o.checkin_id
    WHERE o.id IS NULL
    ORDER BY c.checkin_time DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Endpoint: Get full parking history
app.get("/api/history", (req, res) => {
  const query = `
    SELECT v.plate, v.type, c.checkin_time, o.checkout_time, o.fee
    FROM vehicles v
    LEFT JOIN checkins c ON v.id = c.vehicle_id
    LEFT JOIN checkouts o ON c.id = o.checkin_id
    ORDER BY c.checkin_time DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// ...existing code...

// Add violation to a vehicle and send email
app.post("/api/violations", async (req, res) => {
  const { vehicle_id, violation_type, fine_amount, description } = req.body;

  db.get(`SELECT email FROM vehicles WHERE id = ?`, [vehicle_id], async (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(400).json({ error: "Vehicle not found" });
    }

    const { email } = row;

    db.run(
      `INSERT INTO violations (vehicle_id, violation_type, fine_amount, description)
       VALUES (?, ?, ?, ?)`,
      [vehicle_id, violation_type, fine_amount, description],
      async function (err) {
        if (err) {
          res.status(400).json({ error: err.message });
          return;
        }

        // Send email notification
        const emailSubject = "Parking Violation Notice";
        const emailText = `Dear vehicle owner,\n\nA parking violation has been recorded for your vehicle.\n\nViolation Type: ${violation_type}\nFine Amount: $${fine_amount}\nDescription: ${description}\n\nPlease address this violation as soon as possible.\n\nThank you,\nSmart Parking System`;

        await sendEmail(email, emailSubject, emailText);

        res.json({ id: this.lastID });
      }
    );
  });
});

// Get violations for a vehicle
app.get("/api/violations/:vehicleId", (req, res) => {
  db.all(
    `SELECT * FROM violations WHERE vehicle_id = ? AND paid = 0`,
    [req.params.vehicleId],
    (err, rows) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

app.get("/api/parked", (req, res) => {
  db.all(
    `SELECT v.id, v.plate, v.type, c.checkin_time 
     FROM vehicles v 
     JOIN checkins c ON v.id = c.vehicle_id 
     WHERE c.id NOT IN (SELECT checkin_id FROM checkouts)`,
    [],
    (err, rows) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});
