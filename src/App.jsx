import React, { useState, useEffect } from "react";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import "./App.css";

ChartJS.register(ArcElement, Tooltip, Legend);

function App() {
  const [page, setPage] = useState("home");
  const [plate, setPlate] = useState("");
  const [type, setType] = useState("Car");
  const [email, setEmail] = useState("");
  const [parked, setParked] = useState([]);
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState("");
  const backendUrl = "http://localhost:5000";
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  const [stats, setStats] = useState({
    revenueByType: {},
    vehiclesByType: {},
    avgDurationByType: {},
  });

  const [showViolationForm, setShowViolationForm] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  const fetchParked = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/parked`);
      const data = await res.json();
      setParked(data);
    } catch (err) {
      setMessage("Error fetching parked vehicles");
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/history`);
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      setMessage("Error fetching history");
    }
  };

  useEffect(() => {
    if (page === "home") fetchParked();
    if (page === "history") {
      fetchHistory().then(() => calculateStats());
    }
  }, [page]);

  const handleCheckin = async () => {
    if (!plate.trim() || !type.trim() || !email.trim()) return;
    const res = await fetch(`${backendUrl}/api/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plate, type, email }),
    });
    const data = await res.json();
    setMessage(data.message || data.error);
    fetchParked();
  };

  const handleCheckout = async () => {
    if (!plate.trim()) return;
    const res = await fetch(`${backendUrl}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plate }),
    });
    const data = await res.json();
    setMessage(
      data.message ? `${data.message}. Fee: $${data.fee}` : data.error
    );
    fetchParked();
  };

  const handleAddViolation = async (
    vehicle,
    violationType,
    amount,
    description
  ) => {
    try {
      if (!vehicle.id) {
        throw new Error("Vehicle ID is missing");
      }

      const res = await fetch(`${backendUrl}/api/violations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_id: vehicle.id,
          violation_type: violationType,
          fine_amount: amount,
          description,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setMessage(data.error);
      } else {
        setMessage(`Violation added successfully for vehicle ${vehicle.plate}`);
        setShowViolationForm(false);
      }
    } catch (err) {
      setMessage(`Error adding violation: ${err.message}`);
    }
  };

  const calculateStats = async () => {
    setIsStatsLoading(true);
    try {
      await fetchHistory();

      const revenueByType = {};
      const vehiclesByType = {};
      const durationByType = {};
      const countByType = {};

      history.forEach((entry) => {
        const type = entry.type;

        // Revenue calculation
        if (entry.fee) {
          revenueByType[type] = (revenueByType[type] || 0) + Number(entry.fee);
        }

        // Vehicle count
        vehiclesByType[type] = (vehiclesByType[type] || 0) + 1;

        // Duration calculation
        if (entry.checkin_time && entry.checkout_time) {
          const duration =
            new Date(entry.checkout_time) - new Date(entry.checkin_time);
          durationByType[type] = (durationByType[type] || 0) + duration;
          countByType[type] = (countByType[type] || 0) + 1;
        }
      });

      // Calculate average duration
      const avgDurationByType = {};
      Object.keys(durationByType).forEach((type) => {
        avgDurationByType[type] =
          durationByType[type] / countByType[type] / (1000 * 60 * 60); // Convert to hours
      });

      setStats({ revenueByType, vehiclesByType, avgDurationByType });
    } catch (error) {
      setMessage("Error refreshing statistics");
    } finally {
      setIsStatsLoading(false);
    }
  };

  const prepareChartData = (data, label) => ({
    labels: Object.keys(data),
    datasets: [
      {
        label,
        data: Object.values(data),
        backgroundColor: [
          "rgba(255, 99, 132, 0.5)",
          "rgba(54, 162, 235, 0.5)",
          "rgba(255, 206, 86, 0.5)",
        ],
        borderColor: [
          "rgba(255, 99, 132, 1)",
          "rgba(54, 162, 235, 1)",
          "rgba(255, 206, 86, 1)",
        ],
        borderWidth: 1,
      },
    ],
  });

  const renderStats = () => (
    <div className="stats-container">
      <div className="stats-header">
        <h2>Parking Statistics</h2>
        <button
          className="button refresh-btn"
          onClick={calculateStats}
          disabled={isStatsLoading}
        >
          {isStatsLoading ? "Refreshing..." : "↻ Refresh Stats"}
        </button>
      </div>
      <div className="charts-grid">
        {isStatsLoading ? (
          <div className="loading-message">Loading statistics...</div>
        ) : (
          <>
            <div className="chart-item">
              <h3>Revenue by Vehicle Type</h3>
              <Pie
                data={prepareChartData(stats.revenueByType, "Revenue ($)")}
                options={{ responsive: true }}
              />
            </div>
            <div className="chart-item">
              <h3>Vehicles by Type</h3>
              <Pie
                data={prepareChartData(
                  stats.vehiclesByType,
                  "Number of Vehicles"
                )}
                options={{ responsive: true }}
              />
            </div>
            <div className="chart-item">
              <h3>Average Parking Duration (Hours)</h3>
              <Pie
                data={prepareChartData(stats.avgDurationByType, "Hours")}
                options={{ responsive: true }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="app">
      <header className="header">
        <h1>Smart Parking Solution</h1>
        <nav className="nav">
          <button
            className={`nav-btn ${page === "home" ? "active" : ""}`}
            onClick={() => setPage("home")}
          >
            Current Parking
          </button>
          <button
            className={`nav-btn ${page === "history" ? "active" : ""}`}
            onClick={() => setPage("history")}
          >
            History Log
          </button>
        </nav>
      </header>

      <main className="main">
        {page === "home" && (
          <div className="content">
            <div className="form-container">
              <input
                type="text"
                placeholder="Vehicle Plate"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                className="input"
              />
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="select"
              >
                <option value="Car">Car</option>
                <option value="Bike">Bike</option>
                <option value="Truck">Truck</option>
              </select>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
              <button className="button primary" onClick={handleCheckin}>
                Check In
              </button>
              <button className="button secondary" onClick={handleCheckout}>
                Check Out
              </button>
            </div>

            {message && (
              <div
                className={`message ${
                  message.includes("Error") ? "error" : "success"
                }`}
              >
                {message}
              </div>
            )}

            <div className="list-container">
              <h2>Currently Parked Vehicles</h2>
              {parked.length === 0 ? (
                <p className="empty-message">No vehicles currently parked</p>
              ) : (
                <ul className="list">
                  {parked.map((v, index) => (
                    <li key={index} className="list-item">
                      <div className="vehicle-info">
                        <strong>{v.plate}</strong> ({v.type})
                        <br />
                        <span className="timestamp">
                          Checked in at:{" "}
                          {new Date(v.checkin_time).toLocaleString()}
                        </span>
                      </div>
                      <button
                        className="button warning"
                        onClick={() => {
                          setSelectedVehicle(v);
                          setShowViolationForm(true);
                        }}
                      >
                        Add Violation
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {page === "history" && (
          <div className="content">
            {message && (
              <div
                className={`message ${
                  message.includes("Error") ? "error" : "success"
                }`}
              >
                {message}
              </div>
            )}
            <div className="list-container">
              <h2>Parking History</h2>
              {history.length === 0 ? (
                <p className="empty-message">No parking history available</p>
              ) : (
                <ul className="list">
                  {history.map((entry, index) => (
                    <li key={index} className="list-item">
                      <strong>{entry.plate}</strong> ({entry.type})
                      <br />
                      <span className="timestamp">
                        Checked in:{" "}
                        {entry.checkin_time
                          ? new Date(entry.checkin_time).toLocaleString()
                          : "N/A"}
                        {entry.checkout_time &&
                          ` | Checked out: ${new Date(
                            entry.checkout_time
                          ).toLocaleString()}`}
                        {entry.fee !== null &&
                          ` | Fee: $${Number(entry.fee).toFixed(2)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {renderStats()}
          </div>
        )}
      </main>

      {showViolationForm && (
        <div className="modal">
          <div className="modal-content">
            <h3>Add Violation for {selectedVehicle?.plate}</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const type = e.target.violationType.value;
                const amount = Number(e.target.amount.value);
                const description = e.target.description.value;

                // Add this console.log to debug
                console.log("Adding violation:", {
                  vehicle: selectedVehicle,
                  type,
                  amount,
                  description,
                });

                handleAddViolation(selectedVehicle, type, amount, description);
              }}
            >
              <select name="violationType" required>
                <option value="OVERTIME">Overtime Parking</option>
                <option value="WRONG_SPOT">Wrong Parking Spot</option>
                <option value="NO_PAYMENT">Payment Violation</option>
              </select>
              <input
                type="number"
                name="amount"
                placeholder="Fine Amount"
                required
                min="0"
                step="0.01"
              />
              <textarea
                name="description"
                placeholder="Violation Description"
                rows="3"
              />
              <div className="button-group">
                <button type="submit" className="button primary">
                  Add
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setShowViolationForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
