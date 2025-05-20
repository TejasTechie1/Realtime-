# Real-Time Network Monitor

A comprehensive web-based tool to monitor various aspects of your network connection in real-time, store historical data, and receive alerts.

## Features

*   **Real-time Monitoring:** Tracks Download Speed (Gbps), Upload Speed (Gbps), Latency (ms), Jitter (ms), and Packet Loss (%).
*   **Dynamic Performance Chart:** Visualizes the real-time metrics on a line chart. Users can select which metrics to display via checkboxes.
*   **Average Metrics View:** A bar chart displaying the calculated average for each key network metric over the stored data period.
*   **Network Status:** Displays current connection status (Online/Offline), detected network type (e.g., wifi, cellular), and estimated connection quality (e.g., 4g, 3g).
*   **Network Information:** Shows public IP Address, ISP, City, Region, Country, and Timezone based on IP lookup.
*   **Historical Data Storage:** Performance metrics are stored locally in the browser using IndexedDB.
*   **Historical Data Table:** Allows viewing all stored metrics in a new window, formatted as a table.
*   **CSV Export:**
    *   Download historical network performance metrics as a CSV file.
    *   Download network event logs as a CSV file.
*   **Network Events Log:** Tracks important network events such as connections, disconnections, triggered alerts, and data management actions.
*   **Theming:**
    *   Switch between Light and Dark modes.
    *   Theme preference is saved in `localStorage` and applied on subsequent visits.
*   **Customizable Alerts:**
    *   Users can set custom thresholds for minimum download/upload speeds, and maximum latency, jitter, and packet loss.
    *   Visual alerts highlight metrics on the dashboard when thresholds are breached.
    *   Email notifications are sent (simulated, using EmailJS configuration) when alerts are triggered.
*   **Settings Panel:** A centralized modal (accessed via a cog icon in the header) for configuring:
    *   Theme selection (Light/Dark).
    *   Alert thresholds for all key metrics.
    *   Data retention period (options: 1 day, 7 days, 30 days, 90 days, or Forever).
*   **Data Retention Management:**
    *   Automatically prunes historical network performance data from IndexedDB based on the user-configured retention period.
    *   Users can manually apply the retention policy.
*   **(Simulated) Environmental Monitoring:** The dashboard includes a section displaying mock Temperature, Humidity, and Power Usage data, with simulated email alerts for high values.
*   **(Simulated) Compliance Monitoring:** The dashboard includes a section showing mock GDPR, PCI DSS, and HIPAA compliance statuses, with simulated email alerts for non-compliance.
*   **Usage Guidelines:** An initial popup (`Attention` dialog) provides users with recommendations for accurate network monitoring.
*   **Basic Unit Tests:** Includes console-based tests for core utility functions (`formatTimestamp`, `calculateAverageMetrics`), which can be observed in the browser's developer console.

## How to Use

1.  **Open the Application:** Simply open the `index.html` file in a modern web browser that supports HTML5, CSS3, and JavaScript (ES6+), and IndexedDB.
2.  **Settings Panel:**
    *   Click the **cog icon** (<i class="fas fa-cog"></i>) in the header to open the Settings Panel.
    *   **Theme:** Click the "Toggle Dark/Light Mode" button to switch themes.
    *   **Alerts:** Input your desired thresholds in the "Alert Configuration" section and click "Save Alert Settings".
    *   **Data Retention:** Select how long you want to keep historical data in the "Data Retention" section and click "Save Retention Policy". You can also click "Apply Now" to immediately prune data according to the selected policy.
3.  **Main Performance Chart:**
    *   Use the checkboxes ("Select Metrics to Display") above the chart to toggle the visibility of individual metric datasets (Download, Upload, Latency, Jitter, Packet Loss) on the chart.
4.  **Average Metrics Chart:**
    *   This chart displays the calculated averages of all stored data. Click the "Calculate/Refresh Averages" button below it to update the view, especially after significant data changes (e.g., after applying a new retention policy or clearing data).

## Technologies Used

*   **Frontend:** HTML5, CSS3, JavaScript (ES6+)
*   **Charting:** Chart.js
*   **Icons:** Font Awesome
*   **Client-Side Storage:** IndexedDB
*   **Email Simulation:** EmailJS (configured for sending alerts)

## Development Notes

*   Basic unit tests for some core JavaScript functions are included in `script.js` within the `runBasicTests()` function. Results are logged to the browser's developer console when the application loads.
*   The application is designed to be fully client-side.

## Contributing

Contributions are welcome. Please fork the repository and submit a pull request with your proposed changes.

## License

This project is licensed under the MIT License.
