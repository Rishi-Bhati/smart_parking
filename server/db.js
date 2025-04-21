import sqlite3 from "sqlite3";

const DBSOURCE = "parking.db";
const db = new sqlite3.Database(DBSOURCE, (err) => {
  if (err) {
    console.error("Error opening database", err);
  } else {
    console.log("Connected to SQLite database.");

    // Create vehicles table (plate is unique, with vehicle type)
    db.run(
      `CREATE TABLE IF NOT EXISTS vehicles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plate TEXT UNIQUE,
        type TEXT,
        email TEXT
      )`
    );

    // Create checkins table to record entry events
    db.run(
      `CREATE TABLE IF NOT EXISTS checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER,
        checkin_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
      )`
    );

    // Create checkouts table to record exit events and calculate fee
    db.run(
      `CREATE TABLE IF NOT EXISTS checkouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER,
        checkin_id INTEGER,
        checkout_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        fee REAL,
        FOREIGN KEY(vehicle_id) REFERENCES vehicles(id),
        FOREIGN KEY(checkin_id) REFERENCES checkins(id)
      )`
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS violations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER NOT NULL,
        violation_type TEXT NOT NULL,
        violation_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        fine_amount REAL NOT NULL,
        paid BOOLEAN DEFAULT 0,
        payment_time DATETIME,
        description TEXT,
        FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
      )`
    );
  }
});

export default db;
