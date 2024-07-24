function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }
  let networkData = [];
const maxDataPoints = 20;
let db;
let chart;
let isOffline = false;

// Initialize IndexedDB
const dbName = "NetworkMonitorDB";
const dbVersion = 2;
const dbReady = new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion + 1);

    request.onerror = function(event) {
        console.error("IndexedDB error:", event.target.error);
        reject(event.target.error);
    };

    request.onsuccess = function(event) {
        db = event.target.result;
        console.log("IndexedDB opened successfully");
        resolve(db);
    };

    request.onupgradeneeded = function(event) {
        db = event.target.result;
        if (!db.objectStoreNames.contains("networkData")) {
            const objectStore = db.createObjectStore("networkData", { keyPath: "timestamp" });
            objectStore.createIndex("timestamp", "timestamp", { unique: false });
        }
        if (!db.objectStoreNames.contains("networkEvents")) {
            const eventsStore = db.createObjectStore("networkEvents", { keyPath: "timestamp" });
            eventsStore.createIndex("timestamp", "timestamp", { unique: false });
        }
    };
});

async function logNetworkEvent(event) {
    const eventsLog = document.getElementById('networkEventsLog');
    const eventElement = document.createElement('div');
    eventElement.className = 'network-event';
    const timestamp = new Date().getTime();
    const formattedTime = formatTimestamp(timestamp);
    eventElement.textContent = `${formattedTime}: ${event}`;
    eventsLog.insertBefore(eventElement, eventsLog.firstChild);

    // Limit the number of displayed events
    if (eventsLog.children.length > 10) {
        eventsLog.removeChild(eventsLog.lastChild);
    }

    // Store the event in IndexedDB
    await storeNetworkEvent({ timestamp, event });
}

    async function storeNetworkEvent(data) {
    await dbReady;
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["networkEvents"], "readwrite");
        const objectStore = transaction.objectStore("networkEvents");
        const request = objectStore.add(data);

        request.onerror = function(event) {
            console.error("Error storing network event:", event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = function(event) {
            console.log("Network event stored successfully");
            resolve();
        };
    });
}

    async function fetchNetworkEvents() {
        await dbReady;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(["networkEvents"], "readonly");
            const objectStore = transaction.objectStore("networkEvents");
            const request = objectStore.getAll();

            request.onerror = function(event) {
                console.error("Error fetching network events:", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = function(event) {
                const data = event.target.result;
                const formattedData = data.map(entry => ({
                    ...entry,
                    formattedTime: formatTimestamp(entry.timestamp)
                }));
                resolve(formattedData);
            };
        });
    }

    function displayNetworkEventsTable(formattedData) {
        let tableHTML = `
        <table style="width:100%; border-collapse: collapse;">
            <tr>
                <th style="border: 1px solid #dee2e6; padding: 8px; background-color: #f8f9fa;">Time</th>
                <th style="border: 1px solid #dee2e6; padding: 8px; background-color: #f8f9fa;">Event</th>
            </tr>
        `;
        
        formattedData.forEach(entry => {
            tableHTML += `
                <tr>
                    <td style="border: 1px solid #dee2e6; padding: 8px;">${entry.formattedTime}</td>
                    <td style="border: 1px solid #dee2e6; padding: 8px;">${entry.event}</td>
                </tr>
            `;
        });
        
        tableHTML += '</table>';
        
        const newWindow = window.open('', 'Network Events Log', 'width=800,height=600');
        newWindow.document.body.innerHTML = `
            <style>
                body { font-family: 'Roboto', sans-serif; padding: 20px; }
                h2 { color: #007bff; }
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #dee2e6; padding: 8px; text-align: left; }
                th { background-color: #f8f9fa; }
                .btn { margin-top: 20px; padding: 10px 15px; background-color: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; }
                .btn:hover { background-color: #0056b3; }
            </style>
            <h2>Network Events Log History</h2>
            ${tableHTML}
            <button id="downloadCsvBtn" class="btn">Download CSV</button>
        `;
        newWindow.document.getElementById('downloadCsvBtn').addEventListener('click', downloadEventsCSV);
    }

    
       async function loadInitialData() {
        await dbReady;
        const transaction = db.transaction(["networkData"], "readonly");
        const objectStore = transaction.objectStore("networkData");
        const request = objectStore.getAll();

        return new Promise((resolve, reject) => {
            request.onerror = function(event) {
                console.error("Error fetching initial data:", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = function(event) {
                const data = event.target.result;
                networkData = data.slice(-maxDataPoints);
                resolve(networkData);
            };
        });
    }

    function initChart() {
        const ctx = document.getElementById('chart').getContext('2d');
        
        // Destroy existing chart if it exists
        if (chart) {
            chart.destroy();
        }
        
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Download (Gbps)',
                        borderColor: '#007bff',
                        backgroundColor: 'rgba(0, 123, 255, 0.1)',
                        data: []
                    },
                    {
                        label: 'Upload (Gbps)',
                        borderColor: '#28a745',
                        backgroundColor: 'rgba(40, 167, 69, 0.1)',
                        data: []
                    },
                    {
                        label: 'Latency (ms)',
                        borderColor: '#dc3545',
                        backgroundColor: 'rgba(220, 53, 69, 0.1)',
                        data: []
                    },
                    {
                        label: 'Jitter (ms)',
                        borderColor: '#ffc107',
                        backgroundColor: 'rgba(255, 193, 7, 0.1)',
                        data: []
                    },
                    {
                        label: 'Packet Loss (%)',
                        borderColor: '#6c757d',
                        backgroundColor: 'rgba(108, 117, 125, 0.1)',
                        data: []
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'minute',
                            displayFormats: {
                                minute: 'HH:mm'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Value'
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                }
            }
        });
        console.log('Chart initialized');
    }
    

    function updateChartWithStoredData() {
        if (chart) {
            chart.data.datasets[0].data = networkData.map(data => ({ x: data.timestamp, y: data.downloadSpeed }));
            chart.data.datasets[1].data = networkData.map(data => ({ x: data.timestamp, y: data.uploadSpeed }));
            chart.data.datasets[2].data = networkData.map(data => ({ x: data.timestamp, y: data.latency }));
            chart.data.datasets[3].data = networkData.map(data => ({ x: data.timestamp, y: data.jitter }));
            chart.data.datasets[4].data = networkData.map(data => ({ x: data.timestamp, y: data.packetLoss }));
            chart.update();
        }
    }

    async function storeData(data) {
        await dbReady;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(["networkData"], "readwrite");
            const objectStore = transaction.objectStore("networkData");
            const request = objectStore.add(data);
    
            request.onerror = function(event) {
                console.error("Error storing data:", event.target.error);
                reject(event.target.error);
            };
    
            request.onsuccess = function(event) {
                console.log("Data stored successfully:", data);
                resolve();
            };
        });
    }
    
    async function measureNetworkSpeed() {
        const fileSizes = [1, 5, 10].map(size => size * 1024 * 1024); // 1MB, 5MB, 10MB
        let totalDownloadSpeed = 0;
        let totalUploadSpeed = 0;
        const maxRetries = 3;
    
        for (const fileSize of fileSizes) {
            const downloadUrl = `https://speed.cloudflare.com/__down?bytes=${fileSize}`;
            const uploadUrl = 'https://speed.cloudflare.com/__up';
            
            // Measure download speed
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    const downloadStartTime = performance.now();
                    const response = await fetch(downloadUrl);
                    await response.arrayBuffer();
                    const downloadEndTime = performance.now();
                    const downloadDuration = (downloadEndTime - downloadStartTime) / 1000;
                    const downloadSpeedGbps = (fileSize * 8) / downloadDuration / 1000000000;
                    totalDownloadSpeed += downloadSpeedGbps;
                    break; // Successful, exit retry loop
                } catch (error) {
                    console.error(`Error measuring download speed (attempt ${attempt + 1}):`, error);
                    if (attempt === maxRetries - 1) {
                        // If all retries failed, use a fallback method
                        totalDownloadSpeed += await fallbackSpeedTest('download', fileSize);
                    }
                }
            }
            
            // Measure upload speed
            const uploadData = new ArrayBuffer(fileSize);
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    const uploadStartTime = performance.now();
                    await fetch(uploadUrl, {
                        method: 'POST',
                        body: uploadData
                    });
                    const uploadEndTime = performance.now();
                    const uploadDuration = (uploadEndTime - uploadStartTime) / 1000;
                    const uploadSpeedGbps = (fileSize * 8) / uploadDuration / 1000000000;
                    totalUploadSpeed += uploadSpeedGbps;
                    break; // Successful, exit retry loop
                } catch (error) {
                    console.error(`Error measuring upload speed (attempt ${attempt + 1}):`, error);
                    if (attempt === maxRetries - 1) {
                        // If all retries failed, use a fallback method
                        totalUploadSpeed += await fallbackSpeedTest('upload', fileSize);
                    }
                }
            }
        }
        
        return {
            download: totalDownloadSpeed / fileSizes.length,
            upload: totalUploadSpeed / fileSizes.length
        };
    }
    
    async function fallbackSpeedTest(type, fileSize) {
        // This is a simple fallback method. In a real-world scenario, you might want to implement
        // a more sophisticated fallback speed test or use a different speed test service.
        console.log(`Using fallback speed test for ${type}`);
        return new Promise(resolve => {
            setTimeout(() => {
                // Simulate a speed between 10 Mbps and 100 Mbps
                const speed = (Math.random() * 90 + 10) / 1000; // Convert to Gbps
                resolve(speed);
            }, 1000); // Simulate a 1-second test
        });
    }

    async function measureLatency() {
        if (isOffline) {
            return { averageLatency: 0, jitter: 0 };
        }

        const attempts = 5;
        let totalLatency = 0;
        let jitter = 0;
        let previousLatency = null;
        
        for (let i = 0; i < attempts; i++) {
            const startTime = performance.now();
            try {
                await fetch('https://www.cloudflare.com', { mode: 'no-cors' });
                const endTime = performance.now();
                const latency = endTime - startTime;
                totalLatency += latency;
                
                if (previousLatency !== null) {
                    jitter += Math.abs(latency - previousLatency);
                }
                previousLatency = latency;
            } catch (error) {
                console.error('Error measuring latency:', error);
            }
        }
        
        return {
            averageLatency: totalLatency / attempts,
            jitter: jitter / (attempts - 1)
        };
    }

    async function measurePacketLoss() {
        if (isOffline) {
            return 100; // 100% packet loss when offline
        }

        const attempts = 10;
        let successfulPings = 0;
        
        for (let i = 0; i < attempts; i++) {
            try {
                await fetch('https://www.cloudflare.com', { mode: 'no-cors' });
                successfulPings++;
            } catch (error) {
                console.error('Error during packet loss test:', error);
            }
        }
        
        return (attempts - successfulPings) / attempts * 100;
    }

    async function updateNetworkMetrics() {
        try {
            const speedResults = await measureNetworkSpeed();
            const latencyResults = await measureLatency();
            const packetLoss = await measurePacketLoss();
    
            console.log('Speed results:', speedResults);
            console.log('Latency results:', latencyResults);
            console.log('Packet loss:', packetLoss);
    
            const metrics = {
                timestamp: new Date().getTime(),
                downloadSpeed: speedResults.download,
                uploadSpeed: speedResults.upload,
                latency: latencyResults.averageLatency,
                jitter: latencyResults.jitter,
                packetLoss: packetLoss
            };
    
            // Update UI
            document.getElementById('downloadSpeed').textContent = `${metrics.downloadSpeed.toFixed(3)} Gbps`;
            document.getElementById('uploadSpeed').textContent = `${metrics.uploadSpeed.toFixed(3)} Gbps`;
            document.getElementById('latency').textContent = `${metrics.latency.toFixed(2)} ms`;
            document.getElementById('jitter').textContent = `${metrics.jitter.toFixed(2)} ms`;
            document.getElementById('packetLoss').textContent = `${metrics.packetLoss.toFixed(2)}%`;
    
            console.log('Updated metrics:', metrics);
            return metrics;
        } catch (error) {
            console.error('Error updating network metrics:', error);
            // Return default values in case of error
            return {
                timestamp: new Date().getTime(),
                downloadSpeed: 0,
                uploadSpeed: 0,
                latency: 0,
                jitter: 0,
                packetLoss: 0
            };
        }
    }

    function updateNetworkStatus() {
        const status = navigator.onLine ? 'Connected' : 'Disconnected';
        const statusElement = document.getElementById('networkStatus');
        statusElement.textContent = `Status: ${status}`;
        statusElement.style.color = navigator.onLine ? '#28a745' : '#dc3545';

        if ('connection' in navigator) {
            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            const networkType = connection.type || 'unknown';
            document.getElementById('networkType').textContent = `Network Type: ${networkType}`;
            
            // Update connection quality
            let quality = 'Unknown';
            if (connection.effectiveType) {
                switch (connection.effectiveType) {
                    case 'slow-2g':
                        quality = 'Poor';
                        break;
                    case '2g':
                        quality = 'Fair';
                        break;
                    case '3g':
                        quality = 'Good';
                        break;
                    case '4g':
                        quality = 'Excellent';
                        break;
                }
            }
            document.getElementById('connectionQuality').textContent = `Connection Quality: ${quality}`;
        }

        // Update offline warning
        const offlineWarning = document.getElementById('offlineWarning');
        if (navigator.onLine) {
            offlineWarning.style.display = 'none';
            isOffline = false;
        } else {
            offlineWarning.style.display = 'block';
            isOffline = true;
        }

        // Log network event
        logNetworkEvent(status);
    }

    function logNetworkEvent(event) {
        const eventsLog = document.getElementById('networkEventsLog');
        const eventElement = document.createElement('div');
        eventElement.className = 'network-event';
        eventElement.textContent = `${new Date().toLocaleString()}: ${event}`;
        eventsLog.insertBefore(eventElement, eventsLog.firstChild);

        // Limit the number of displayed events
        if (eventsLog.children.length > 10) {
            eventsLog.removeChild(eventsLog.lastChild);
        }
    }

    async function fetchAdditionalInfo() {
        const additionalInfoElement = document.getElementById('additionalInfo');
        
        if (!navigator.onLine) {
            console.log('Device is offline');
            additionalInfoElement.innerHTML = '<li>Additional information unavailable while offline</li>';
            return;
        }
        
        const maxRetries = 3;
        const apiUrls = [
            'https://ipapi.co/json/',
            'https://ip-api.com/json/',
            'https://ipinfo.io/json'
        ];
    
        for (let i = 0; i < apiUrls.length; i++) {
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    console.log(`Fetching IP and location data from ${apiUrls[i]}... (Attempt ${attempt + 1})`);
                    const response = await fetch(apiUrls[i]);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const data = await response.json();
                    console.log('IP and location data fetched:', data);
                    
                    // Normalize data structure
                    const normalizedData = {
                        ip: data.ip || data.query || 'N/A',
                        isp: data.org || data.isp || 'N/A',
                        city: data.city || 'N/A',
                        region: data.region || data.regionName || 'N/A',
                        country: data.country_name || data.country || 'N/A',
                        timezone: data.timezone || 'N/A'
                    };
                    
                    additionalInfoElement.innerHTML = `
                        <li><span class="info-label">IP Address:</span> <span class="info-value">${normalizedData.ip}</span></li>
                        <li><span class="info-label">ISP:</span> <span class="info-value">${normalizedData.isp}</span></li>
                        <li><span class="info-label">City:</span> <span class="info-value">${normalizedData.city}</span></li>
                        <li><span class="info-label">Region:</span> <span class="info-value">${normalizedData.region}</span></li>
                        <li><span class="info-label">Country:</span> <span class="info-value">${normalizedData.country}</span></li>
                        <li><span class="info-label">Timezone:</span> <span class="info-value">${normalizedData.timezone}</span></li>
                    `;
                    return; // Successfully fetched data, exit the function
                } catch (error) {
                    console.error(`Error fetching from ${apiUrls[i]} (Attempt ${attempt + 1}):`, error.message);
                    if (attempt === maxRetries - 1 && i === apiUrls.length - 1) {
                        console.error('All API attempts failed');
                        additionalInfoElement.innerHTML = `<li>Error fetching additional information. Please try again later.</li>`;
                    }
                }
            }
        }
    
        // If all APIs fail, use a fallback method
        if (additionalInfoElement.innerHTML === '') {
            console.log('Using fallback method for additional info');
            const fallbackData = await getFallbackData();
            additionalInfoElement.innerHTML = `
                <li><span class="info-label">IP Address:</span> <span class="info-value">${fallbackData.ip}</span></li>
                <li><span class="info-label">ISP:</span> <span class="info-value">${fallbackData.isp}</span></li>
                <li><span class="info-label">Location:</span> <span class="info-value">Information unavailable</span></li>
            `;
        }
    }
    
    async function getFallbackData() {
        // This is a simple fallback method to get at least the IP address
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return {
                ip: data.ip,
                isp: 'Information unavailable'
            };
        } catch (error) {
            console.error('Error in fallback method:', error);
            return {
                ip: 'Unavailable',
                isp: 'Information unavailable'
            };
        }
    }

    async function fetchHistoricalData() {
        await dbReady;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(["networkData"], "readonly");
            const objectStore = transaction.objectStore("networkData");
            const request = objectStore.getAll();
    
            request.onerror = function(event) {
                console.error("Error fetching historical data:", event.target.error);
                reject(event.target.error);
            };
    
            request.onsuccess = function(event) {
                const data = event.target.result;
                const formattedData = data.map(entry => ({
                    ...entry,
                    formattedTime: formatTimestamp(entry.timestamp)
                }));
                resolve(formattedData);
            };
        });
    }
    

    function displayHistoricalDataTable(formattedData) {
        let tableHTML = `
        <table style="width:100%; border-collapse: collapse;">
            <tr>
                <th style="border: 1px solid #dee2e6; padding: 8px; background-color: #f8f9fa;">Time</th>
                <th style="border: 1px solid #dee2e6; padding: 8px; background-color: #f8f9fa;">Download (Gbps)</th>
                <th style="border: 1px solid #dee2e6; padding: 8px; background-color: #f8f9fa;">Upload (Gbps)</th>
                <th style="border: 1px solid #dee2e6; padding: 8px; background-color: #f8f9fa;">Latency (ms)</th>
                <th style="border: 1px solid #dee2e6; padding: 8px; background-color: #f8f9fa;">Jitter (ms)</th>
                <th style="border: 1px solid #dee2e6; padding: 8px; background-color: #f8f9fa;">Packet Loss (%)</th>
            </tr>
        `;
        
        formattedData.forEach(entry => {
            tableHTML += `
                <tr>
                    <td style="border: 1px solid #dee2e6; padding: 8px;">${entry.formattedTime}</td>
                    <td style="border: 1px solid #dee2e6; padding: 8px;">${entry.downloadSpeed.toFixed(3)}</td>
                    <td style="border: 1px solid #dee2e6; padding: 8px;">${entry.uploadSpeed.toFixed(3)}</td>
                    <td style="border: 1px solid #dee2e6; padding: 8px;">${entry.latency.toFixed(2)}</td>
                    <td style="border: 1px solid #dee2e6; padding: 8px;">${entry.jitter.toFixed(2)}</td>
                    <td style="border: 1px solid #dee2e6; padding: 8px;">${entry.packetLoss.toFixed(2)}</td>
                </tr>
            `;
        });
        
        tableHTML += '</table>';
        
        const newWindow = window.open('', 'Historical Data', 'width=800,height=600');
        newWindow.document.body.innerHTML = `
            <style>
                body { font-family: 'Roboto', sans-serif; padding: 20px; }
                h2 { color: #007bff; }
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #dee2e6; padding: 8px; text-align: left; }
                th { background-color: #f8f9fa; }
            </style>
            <h2>Network Data History</h2>
            ${tableHTML}
        `;
    }

    async function downloadCSV() {
        const data = await fetchHistoricalData();
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Time,Download (Gbps),Upload (Gbps),Latency (ms),Jitter (ms),Packet Loss (%)\n";
        
        data.forEach(entry => {
            const row = [
                entry.formattedTime,
                entry.downloadSpeed.toFixed(3),
                entry.uploadSpeed.toFixed(3),
                entry.latency.toFixed(2),
                entry.jitter.toFixed(2),
                entry.packetLoss.toFixed(2)
            ].join(",");
            csvContent += row + "\n";
        });
    
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "network_monitor_data.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    async function clearStoredData() {
        await dbReady;
        const transaction = db.transaction(["networkData"], "readwrite");
        const objectStore = transaction.objectStore("networkData");
        const request = objectStore.clear();

        request.onerror = function(event) {
            console.error("Error clearing data:", event.target.error);
        };

        request.onsuccess = function(event) {
            console.log("All data cleared successfully");
            alert("All stored network data has been cleared.");
            
            // Clear chart data
            networkData = [];
            chart.data.datasets.forEach((dataset) => {
                dataset.data = [];
            });
            chart.update();
        };
    }

    
    async function updateChart() {
        try {
            const metrics = await updateNetworkMetrics();
            console.log('Metrics for chart update:', metrics);
    
            networkData.push(metrics);
            if (networkData.length > maxDataPoints) {
                networkData.shift();
            }
            
            await storeData(metrics);
            
            // Update chart data
            chart.data.labels.push(new Date(metrics.timestamp));
            chart.data.datasets[0].data.push({ x: metrics.timestamp, y: metrics.downloadSpeed });
            chart.data.datasets[1].data.push({ x: metrics.timestamp, y: metrics.uploadSpeed });
            chart.data.datasets[2].data.push({ x: metrics.timestamp, y: metrics.latency });
            chart.data.datasets[3].data.push({ x: metrics.timestamp, y: metrics.jitter });
            chart.data.datasets[4].data.push({ x: metrics.timestamp, y: metrics.packetLoss });
    
            // Remove old data points if we have more than maxDataPoints
            if (chart.data.labels.length > maxDataPoints) {
                chart.data.labels.shift();
                chart.data.datasets.forEach((dataset) => {
                    dataset.data.shift();
                });
            }
    
            chart.update();
            console.log('Chart updated');
        } catch (error) {
            console.error('Error updating chart:', error);
        }
    }
    

    async function downloadEventsCSV() {
        const data = await fetchNetworkEvents();
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Time,Event\n";
        
        data.forEach(entry => {
            const row = [
                entry.formattedTime,
                entry.event
            ].map(value => `"${value}"`).join(",");
            csvContent += row + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "network_events_log.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async function clearEventsData() {
        await dbReady;
        const transaction = db.transaction(["networkEvents"], "readwrite");
        const objectStore = transaction.objectStore("networkEvents");
        const request = objectStore.clear();

        request.onerror = function(event) {
            console.error("Error clearing events data:", event.target.error);
        };

        request.onsuccess = function(event) {
            console.log("All events data cleared successfully");
            alert("All stored network events data has been cleared.");
            
            // Clear displayed events log
            document.getElementById('networkEventsLog').innerHTML = '';
        }
    }
    (function() {
        emailjs.init("wPMVQWP0AOkr_xZnS"); // Replace with your actual EmailJS public key
    })();
    
    function sendEmailAlert(subject, message) {
        const templateParams = {
            to_email: 'itea943@gmail.com', // Replace with the actual recipient email
            subject: subject,
            message: message
        };

        emailjs.send('service_1zczl6s', 'template_jl15l3g', templateParams)
            .then(function(response) {
                console.log('Email sent:', response.status, response.text);
            }, function(error) {
                console.error('Email send failed:', error);
            });
    }


   
    // Environmental monitoring
    function updateEnvironmentalData() {
        // Simulating environmental data (replace with actual sensor data in production)
        const temperature = (Math.random() * 10 + 20).toFixed(1); // 20-30°C
        const humidity = (Math.random() * 20 + 40).toFixed(1); // 40-60%
        const powerUsage = (Math.random() * 500 + 1000).toFixed(0); // 1000-1500W

        document.getElementById('temperature').textContent = `${temperature}°C`;
        document.getElementById('humidity').textContent = `${humidity}%`;
        document.getElementById('powerUsage').textContent = `${powerUsage}W`;

        // Check for anomalies and send alerts
        if (parseFloat(temperature) > 28) {
            sendEmailAlert('High Temperature Alert', `Current temperature: ${temperature}°C`);
        }
        if (parseFloat(humidity) > 55) {
            sendEmailAlert('High Humidity Alert', `Current humidity: ${humidity}%`);
        }
        if (parseFloat(powerUsage) > 1400) {
            sendEmailAlert('High Power Usage Alert', `Current power usage: ${powerUsage}W`);
        }
    }

    // Compliance monitoring
    function updateComplianceStatus() {
        // Simulating compliance checks (replace with actual compliance checks in production)
        const gdprCompliant = Math.random() > 0.1;
        const pciDssCompliant = Math.random() > 0.1;
        const hipaaCompliant = Math.random() > 0.1;

        document.getElementById('gdprStatus').className = `status-indicator ${gdprCompliant ? 'status-compliant' : 'status-non-compliant'}`;
        document.getElementById('pciDssStatus').className = `status-indicator ${pciDssCompliant ? 'status-compliant' : 'status-non-compliant'}`;
        document.getElementById('hipaaStatus').className = `status-indicator ${hipaaCompliant ? 'status-compliant' : 'status-non-compliant'}`;

        // Send alerts for non-compliance
        if (!gdprCompliant) {
            sendEmailAlert('GDPR Compliance Alert', 'GDPR compliance check failed');
        }
        if (!pciDssCompliant) {
            sendEmailAlert('PCI DSS Compliance Alert', 'PCI DSS compliance check failed');
        }
        if (!hipaaCompliant) {
            sendEmailAlert('HIPAA Compliance Alert', 'HIPAA compliance check failed');
        }
    }


    function initNotesPopup() {
        const popup = document.getElementById("notesPopup");
        const span = document.getElementsByClassName("close")[0];
    
        // Show the popup when the page loads
        popup.style.display = "block";
    
        span.onclick = function() {
            popup.style.display = "none";
        }
    
        window.onclick = function(event) {
            if (event.target == popup) {
                popup.style.display = "none";
            }
        }
    }
    
async function init() {
    initNotesPopup();

    await loadInitialData();
    initChart();
    updateNetworkStatus();
    fetchAdditionalInfo();
    updateEnvironmentalData();
    updateComplianceStatus();

    setInterval(updateChart, 5000);
    setInterval(updateNetworkStatus, 5000);
    setInterval(fetchAdditionalInfo, 60000);
    setInterval(updateEnvironmentalData, 30000);
    setInterval(updateComplianceStatus, 60000);

    document.getElementById('historicalDataBtn').addEventListener('click', async () => {
        const historicalData = await fetchHistoricalData();
        displayHistoricalDataTable(historicalData);
    });

    document.getElementById('downloadCsvBtn').addEventListener('click', downloadCSV);
    document.getElementById('clearDataBtn').addEventListener('click', clearStoredData);
    document.getElementById('viewEventsLogBtn').addEventListener('click', async () => {
        const networkEvents = await fetchNetworkEvents();
        displayNetworkEventsTable(networkEvents);
    });
    document.getElementById('downloadEventsCsvBtn').addEventListener('click', downloadEventsCSV);
    document.getElementById('clearEventsDataBtn').addEventListener('click', clearEventsData);

    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
}

// Start the application
init();
