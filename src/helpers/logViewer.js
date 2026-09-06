const path = require("path");
const fs = require("fs");

const logViewer = async (req, res) => {
  try {
    const logPath = path.join(__dirname, "..", "../app.log");
    const logData = await fs.promises.readFile(logPath, "utf-8");

    const logEntries = logData.split("\n").filter((line) => line.trim() !== "");

    const groupedLogs = logEntries.reduce((acc, logEntry) => {
      try {
        const log = JSON.parse(logEntry);
        const logDate = new Date(log.timestamp).toLocaleDateString();

        if (!acc[logDate]) {
          acc[logDate] = { logs: [], summary: { total: 0, errors: 0, warnings: 0 } };
        }

        acc[logDate].logs.push(log);
        acc[logDate].summary.total += 1;
        if (log.level?.toLowerCase() === "error") acc[logDate].summary.errors += 1;
        if (log.level?.toLowerCase() === "warn") acc[logDate].summary.warnings += 1;
      } catch (error) {
        console.error("Error parsing log entry:", error);
      }

      return acc;
    }, {});

    const formattedData = Object.keys(groupedLogs).map((date) => {
      const { logs, summary } = groupedLogs[date];

      const logItems = logs.map((log, index) => {
        const timestamp = new Date(log.timestamp).toLocaleString();
        return `
          <tr class="log-entry">
            <td><strong>${log.level?.toUpperCase()}</strong></td>
            <td><em>${timestamp}</em></td>
            <td>${log.method || "N/A"}</td>
            <td>${log.message || "N/A"}</td>
            <td>${log.url || "N/A"}</td>
            <td><button class="toggle-btn" onclick="toggleDetails('details-${date}-${index}')">Details</button></td>
          </tr>
          <tr id="details-${date}-${index}" class="log-details" style="display:none;">
            <td colspan="6">
              <strong>Stack:</strong>
              <pre>${log.stack || "N/A"}</pre>
            </td>
          </tr>
        `;
      }).join("");

      return `
        <div class="log-day" id="log-day-${date}">
          <div class="date-header" onclick="toggleLogDetails('details-table-${date}')">
            <h3>${date}</h3>
            <div class="summary">
              <span class="metric total">Total: ${summary.total}</span>
              <span class="metric error">Errors: ${summary.errors}</span>
              <span class="metric warning">Warnings: ${summary.warnings}</span>
            </div>
          </div>
          <div class="log-details-table" id="details-table-${date}">
            <table class="log-table">
              <thead>
                <tr>
                  <th>Level</th>
                  <th>Timestamp</th>
                  <th>Method</th>
                  <th>Message</th>
                  <th>URL</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${logItems || "<tr><td colspan='6'>No valid logs for this date.</td></tr>"}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join("");

    res.send(`
      <html>
        <head>
          <title>🧾 Server Log Dashboard</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            :root {
              --primary-color: #4caf50;
              --error-color: #e57373;
              --warning-color: #ffb300;
              --bg-color: #1a1a1a;
              --card-bg: #2a2a2a;
              --text-color: #f4f4f4;
              --header-bg: #333333;
            }

            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }

            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background-color: var(--bg-color);
              color: var(--text-color);
              min-height: 100vh;
              padding: 20px;
              display: flex;
              flex-direction: column;
              align-items: center;
              line-height: 1.5;
              overflow-x: hidden; /* Prevent horizontal scrolling */
            }

            h1 {
              font-size: 2.2rem;
              color: var(--primary-color);
              margin-bottom: 30px;
              text-align: center;
              font-weight: 600;
            }

            .dashboard {
              width: 100%;
              max-width: 1400px;
              display: flex;
              flex-direction: column;
              gap: 20px;
              margin-bottom: 40px;
            }

            .log-day {
              background-color: var(--card-bg);
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
              overflow: hidden;
              animation: gentleShake 4s ease-in-out infinite;
              margin-bottom: 15px;
            }

            .log-day:hover {
              transform: translateY(-4px);
            }

            @keyframes gentleShake {
              0%, 100% { transform: translateX(0); }
              25% { transform: translateX(-3px); }
              50% { transform: translateX(3px); }
              75% { transform: translateX(-3px); }
            }

            .date-header {
              background-color: var(--header-bg);
              padding: 15px 20px;
              cursor: pointer;
              display: flex;
              flex-direction: column;
              gap: 10px;
              border-bottom: 1px solid #444;
              transition: background-color 0.3s ease;
            }

            .date-header:hover {
              background-color: #3b3b3b;
            }

            .date-header h3 {
              font-size: 1.6rem;
              color: var(--primary-color);
              font-weight: 600;
              margin: 0;
            }

            .summary {
              display: flex;
              flex-wrap: wrap;
              gap: 15px;
              font-size: 0.95rem;
            }

            .metric {
              padding: 5px 10px;
              border-radius: 4px;
              font-weight: 500;
            }

            .metric.total {
              background-color: #424242;
            }

            .metric.error {
              background-color: var(--error-color);
              color: #fff;
            }

            .metric.warning {
              background-color: var(--warning-color);
              color: #fff;
            }

            .log-details-table {
              padding: 15px;
              background-color: var(--card-bg);
              max-height: 0; /* Initially set max-height to 0 to collapse the details */
              overflow-y: hidden; /* Initially hide overflow */
              transition: max-height 0.3s ease-out, opacity 0.3s ease-out;
              opacity: 0;
            }

            .log-details-table.show {
              max-height: 400px; /* Set the max-height when expanded */
              opacity: 1;
              overflow-y: auto; /* Enable scrolling */
            }

            .log-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 0.9rem;
            }

            .log-table th, .log-table td {
              padding: 12px 15px;
              text-align: left;
              border-bottom: 1px solid #444;
            }

            .log-table th {
              background-color: var(--header-bg);
              color: var(--text-color);
              font-weight: 600;
            }

            .log-entry:hover {
              background-color: #3b3b3b;
            }

            .log-details {
              background-color: #333;
              padding: 10px;
              border-radius: 5px;
            }

            .toggle-btn {
              background-color: var(--primary-color);
              color: #fff;
              padding: 6px 12px;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 0.85rem;
              transition: background-color 0.3s ease;
            }

            .toggle-btn:hover {
              background-color: #388e3c;
            }

            pre {
              white-space: pre-wrap;
              font-size: 0.85rem;
              color: #ddd;
            }

            @media (max-width: 768px) {
              .date-header h3 {
                font-size: 1.4rem;
              }

              .summary {
                font-size: 0.85rem;
                gap: 10px;
              }

              .log-table th, .log-table td {
                padding: 8px 10px;
                font-size: 0.85rem;
              }
            }

            @media (max-width: 480px) {
              body {
                padding: 10px;
              }

              h1 {
                font-size: 1.8rem;
              }

              .log-day {
                margin-bottom: 15px;
              }
            }
          </style>
          <script>
            function toggleDetails(id) {
              const details = document.getElementById(id);
              details.style.display = details.style.display === "none" ? "table-row" : "none";
            }

            function toggleLogDetails(tableId) {
              const table = document.getElementById(tableId);
              if (table.classList.contains('show')) {
                table.classList.remove('show');
              } else {
                table.classList.add('show');
              }
            }
          </script>
        </head>
        <body>
          <h1>🧾 Server Log Dashboard</h1>
          <div class="dashboard">
            ${formattedData || "<p>No valid logs found.</p>"}
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error generating the server home page:", error);
    res.status(500).send("An error occurred while generating the server home page.");
  }
};

module.exports = { logViewer };
