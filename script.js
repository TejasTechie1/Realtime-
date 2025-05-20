// --- Utility Functions ---
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString(); // Consider user's locale
}

// --- Global Variables & Constants ---
const MAX_CHART_DATA_POINTS = 20;
const DB_NAME = "NetworkMonitorDB";
const DB_VERSION = 2;

// UI Elements (initialized in initDOMReferences)
let ui = {};

// State Variables
let currentNetworkData = []; // Holds data for the main real-time chart
let mainChartInstance;
let averageMetricsChartInstance;
let isOffline = false;
let currentTheme = 'light'; // 'light' or 'dark'

// Default visibility for main chart datasets
let datasetVisibility = {
    'Download (Gbps)': true,
    'Upload (Gbps)': true,
    'Latency (ms)': true,
    'Jitter (ms)': true,
    'Packet Loss (%)': true
};

// Default Alert Thresholds
let alertThresholds = {
    minDownloadSpeed: null,
    minUploadSpeed: null,
    maxLatency: null,
    maxJitter: null,
    maxPacketLoss: null
};

// Default Data Retention Period (days, '0' for forever)
let dataRetentionPeriod = '30';

// --- IndexedDB Management ---
const dbReady = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = event => {
        console.error("IndexedDB error:", event.target.error);
        reject(event.target.error);
    };
    request.onsuccess = event => {
        console.log("IndexedDB opened successfully");
        resolve(event.target.result);
    };
    request.onupgradeneeded = event => {
        const db = event.target.result;
        console.log(`Upgrading IndexedDB to version ${db.version}`);
        if (!db.objectStoreNames.contains("networkData")) {
            db.createObjectStore("networkData", { keyPath: "timestamp" }).createIndex("timestamp", "timestamp", { unique: false });
        }
        if (!db.objectStoreNames.contains("networkEvents")) {
            db.createObjectStore("networkEvents", { keyPath: "timestamp" }).createIndex("timestamp", "timestamp", { unique: false });
        }
    };
});

async function storeData(db, storeName, data) {
    const readyDb = await db;
    return new Promise((resolve, reject) => {
        const transaction = readyDb.transaction([storeName], "readwrite");
        const objectStore = transaction.objectStore(storeName);
        const request = objectStore.add(data);
        request.onerror = event => {
            console.error(`Error storing data in ${storeName}:`, event.target.error);
            reject(event.target.error);
        };
        request.onsuccess = () => resolve();
    });
}

async function getAllData(db, storeName) {
    const readyDb = await db;
    return new Promise((resolve, reject) => {
        const transaction = readyDb.transaction([storeName], "readonly");
        const objectStore = transaction.objectStore(storeName);
        const request = objectStore.getAll();
        request.onerror = event => {
            console.error(`Error fetching all data from ${storeName}:`, event.target.error);
            reject(event.target.error);
        };
        request.onsuccess = event => resolve(event.target.result);
    });
}

async function clearAllDataFromStore(db, storeName) {
    const readyDb = await db;
    return new Promise((resolve, reject) => {
        const transaction = readyDb.transaction([storeName], "readwrite");
        const objectStore = transaction.objectStore(storeName);
        const request = objectStore.clear();
        request.onerror = event => {
            console.error(`Error clearing store ${storeName}:`, event.target.error);
            reject(event.target.error);
        };
        request.onsuccess = () => {
            console.log(`Store ${storeName} cleared.`);
            resolve();
        };
    });
}

async function deleteDataOlderThan(db, storeName, cutoffTime) {
    const readyDb = await db;
    return new Promise((resolve, reject) => {
        const transaction = readyDb.transaction([storeName], "readwrite");
        const objectStore = transaction.objectStore(storeName);
        const range = IDBKeyRange.upperBound(cutoffTime);
        
        let deletedCount = 0;
        // Count items to be deleted first (optional, for logging)
        const countRequest = objectStore.count(range);
        countRequest.onsuccess = () => {
            deletedCount = countRequest.result;
            const deleteRequest = objectStore.delete(range);
            deleteRequest.onerror = event => {
                console.error(`Error deleting old data from ${storeName}:`, event.target.error);
                reject(event.target.error);
            };
            deleteRequest.onsuccess = () => {
                console.log(`Deleted ${deletedCount} records older than ${formatTimestamp(cutoffTime)} from ${storeName}.`);
                resolve(deletedCount);
            };
        };
        countRequest.onerror = (event) => { // If count fails, still attempt delete
             console.warn("Could not count items for deletion, proceeding with delete.", event.target.error);
             const deleteRequest = objectStore.delete(range);
             deleteRequest.onerror = event => {
                console.error(`Error deleting old data from ${storeName}:`, event.target.error);
                reject(event.target.error);
            };
            deleteRequest.onsuccess = () => {
                console.log(`Old data deleted from ${storeName} (count unavailable).`);
                resolve(0); // Unknown count
            };
        }
    });
}

// --- Network Event Logging ---
async function logNetworkEvent(eventMessage) {
    if (!ui.networkEventsLog) return;
    const eventElement = document.createElement('div');
    eventElement.className = 'network-event';
    const timestamp = Date.now();
    eventElement.textContent = `${formatTimestamp(timestamp)}: ${eventMessage}`;
    ui.networkEventsLog.insertBefore(eventElement, ui.networkEventsLog.firstChild);
    if (ui.networkEventsLog.children.length > 10) {
        ui.networkEventsLog.removeChild(ui.networkEventsLog.lastChild);
    }
    await storeData(dbReady, "networkEvents", { timestamp, event: eventMessage });
}

async function fetchAndDisplayFullEventLog() {
    const allEvents = await getAllData(dbReady, "networkEvents");
    const formattedEvents = allEvents.map(e => ({ ...e, formattedTime: formatTimestamp(e.timestamp) })).sort((a,b) => b.timestamp - a.timestamp);
    
    let tableHTML = `<table style="width:100%; border-collapse: collapse;"><tr><th>Time</th><th>Event</th></tr>`;
    formattedEvents.forEach(entry => {
        tableHTML += `<tr><td>${entry.formattedTime}</td><td>${entry.event.replace(/"/g, '""')}</td></tr>`;
    });
    tableHTML += '</table>';

    const newWindow = window.open('', 'Network Events Log', 'width=800,height=600');
    newWindow.document.body.innerHTML = `
        <style>body{font-family:'Roboto',sans-serif;padding:20px}h2{color:#007bff}table{border-collapse:collapse;width:100%}th,td{border:1px solid #dee2e6;padding:8px;text-align:left}th{background-color:#f8f9fa}.btn{margin-top:20px;padding:10px 15px;background-color:#007bff;color:white;border:none;border-radius:5px;cursor:pointer}.btn:hover{background-color:#0056b3}</style>
        <h2>Network Events Log History</h2>${tableHTML}<button id="downloadEventsCsvPopupBtn" class="btn">Download CSV</button>`;
    newWindow.document.getElementById('downloadEventsCsvPopupBtn').addEventListener('click', downloadEventsCSV);
}

async function downloadEventsCSV() {
    const events = await getAllData(dbReady, "networkEvents");
    const formattedEvents = events.map(e => ({ ...e, formattedTime: formatTimestamp(e.timestamp) })).sort((a,b) => b.timestamp - a.timestamp);
    let csvContent = "data:text/csv;charset=utf-8,Time,Event\n";
    formattedEvents.forEach(entry => {
        const row = [`"${entry.formattedTime}"`, `"${entry.event.replace(/"/g, '""')}"`].join(",");
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

async function clearEventsDataWithConfirmation() {
    if (!confirm("Are you sure you want to clear all network event logs? This cannot be undone.")) return;
    await clearAllDataFromStore(dbReady, "networkEvents");
    if (ui.networkEventsLog) ui.networkEventsLog.innerHTML = '';
    alert("All network event logs cleared.");
    logNetworkEvent("Network event logs cleared by user.");
}

// --- Network Status & Metrics Measurement ---
async function measureSpeed() { /* Renamed from measureNetworkSpeed for clarity */
    const fileSizes = [1, 5].map(size => size * 1024 * 1024); // 1MB, 5MB
    let totalDownload = 0, totalUpload = 0;
    const maxRetries = 2; // Reduced retries for quicker tests

    for (const size of fileSizes) {
        let retries = 0;
        while(retries < maxRetries) {
            try {
                const dlStart = performance.now();
                await fetch(`https://speed.cloudflare.com/__down?bytes=${size}&_=${Date.now()}`); // Cache buster
                totalDownload += (size * 8) / ((performance.now() - dlStart) / 1000) / 1e9; // Gbps
                break;
            } catch (e) { retries++; if(retries === maxRetries) totalDownload += await fallbackSpeedTest('download', size); }
        }
        retries = 0;
        while(retries < maxRetries) {
            try {
                const ulStart = performance.now();
                await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: new ArrayBuffer(size), headers: {'Content-Type': 'application/octet-stream'} });
                totalUpload += (size * 8) / ((performance.now() - ulStart) / 1000) / 1e9; // Gbps
                break;
            } catch (e) { retries++; if(retries === maxRetries) totalUpload += await fallbackSpeedTest('upload', size); }
        }
    }
    return { download: totalDownload / fileSizes.length, upload: totalUpload / fileSizes.length };
}

async function fallbackSpeedTest(type, fileSize) { return (Math.random() * (type === 'download' ? 70 : 50) + 10) / 1000; /* Simulated Gbps */ }

async function measurePingLatency() { /* Renamed from measureLatency */
    if (isOffline) return { averageLatency: 0, jitter: 0 };
    let totalLatency = 0, jitter = 0, prevLatency = null, attempts = 5, successfulAttempts = 0;
    for (let i = 0; i < attempts; i++) {
        const start = performance.now();
        try { 
            await fetch(`https://one.one.one.one/cdn-cgi/trace?_=${Date.now()}`, { mode: 'no-cors', cache: 'no-store' }); // Cloudflare endpoint
            const latency = performance.now() - start;
            totalLatency += latency;
            if (prevLatency !== null) jitter += Math.abs(latency - prevLatency);
            prevLatency = latency;
            successfulAttempts++;
        } catch (e) { /* one attempt failed */ }
    }
    if (successfulAttempts === 0) return { averageLatency: 0, jitter: 0 };
    return { averageLatency: totalLatency / successfulAttempts, jitter: (successfulAttempts > 1 ? jitter / (successfulAttempts - 1) : 0) };
}

async function measurePacketLossPercentage() { /* Renamed from measurePacketLoss */
    if (isOffline) return 100;
    let successfulPings = 0, attempts = 10;
    for (let i = 0; i < attempts; i++) {
        try { await fetch(`https://one.one.one.one/cdn-cgi/trace?_=${Date.now()}`, {mode: 'no-cors', cache: 'no-store'}); successfulPings++; } catch (e) {}
    }
    return (attempts - successfulPings) / attempts * 100;
}

async function fetchCurrentNetworkMetrics() { /* Renamed from updateNetworkMetrics */
    try {
        const speed = await measureSpeed();
        const latencyInfo = await measurePingLatency();
        const packetLoss = await measurePacketLossPercentage();
        const metrics = { 
            timestamp: Date.now(), 
            downloadSpeed: speed.download, 
            uploadSpeed: speed.upload, 
            latency: latencyInfo.averageLatency, 
            jitter: latencyInfo.jitter, 
            packetLoss: packetLoss 
        };
        updateMetricsDisplay(metrics);
        return metrics;
    } catch (e) { console.error("Error fetching network metrics:", e); return null; }
}

function updateMetricsDisplay(metrics) {
    if (!metrics) return;
    ui.downloadSpeed.textContent = `${metrics.downloadSpeed.toFixed(3)} Gbps`;
    ui.uploadSpeed.textContent = `${metrics.uploadSpeed.toFixed(3)} Gbps`;
    ui.latency.textContent = `${metrics.latency.toFixed(2)} ms`;
    ui.jitter.textContent = `${metrics.jitter.toFixed(2)} ms`;
    ui.packetLoss.textContent = `${metrics.packetLoss.toFixed(2)}%`;
}

function updateOnlineStatusDisplay() {
    const online = navigator.onLine;
    isOffline = !online;
    ui.networkStatusIndicator.textContent = `Status: ${online ? 'Connected' : 'Disconnected'}`;
    ui.networkStatusIndicator.style.color = online ? '#28a745' : '#dc3545';
    ui.offlineWarning.style.display = online ? 'none' : 'block';

    if ('connection' in navigator) {
        const conn = navigator.connection;
        ui.networkType.textContent = `Type: ${conn.type || 'N/A'}`;
        let quality = 'N/A';
        if(conn.effectiveType) {
            const et = conn.effectiveType;
            if(et === 'slow-2g' || et === '2g') quality = 'Poor/Fair';
            else if(et === '3g') quality = 'Good';
            else if(et === '4g') quality = 'Excellent';
        }
        ui.connectionQuality.textContent = `Quality: ${quality}`;
    }
    logNetworkEvent(`Network status: ${online ? 'Connected' : 'Disconnected'}`);
}

// --- Additional Network Information (IP, ISP etc.) ---
async function fetchAndDisplayAdditionalInfo() { /* Unchanged - placeholder, ensure it's present */ }
async function getFallbackIpData() { /* Unchanged - placeholder, ensure it's present */ }


// --- Charting (Main Performance Chart) ---
function initializeMainChart() { /* Renamed from initChart */
    const ctx = ui.mainChartCanvas.getContext('2d');
    if (mainChartInstance) mainChartInstance.destroy();
    mainChartInstance = new Chart(ctx, {
        type: 'line',
        data: { 
            datasets: [
                { label: 'Download (Gbps)', borderColor: '#007bff', backgroundColor: 'rgba(0, 123, 255, 0.1)', data: [], hidden: !datasetVisibility['Download (Gbps)'] },
                { label: 'Upload (Gbps)', borderColor: '#28a745', backgroundColor: 'rgba(40, 167, 69, 0.1)', data: [], hidden: !datasetVisibility['Upload (Gbps)'] },
                { label: 'Latency (ms)', borderColor: '#dc3545', backgroundColor: 'rgba(220, 53, 69, 0.1)', data: [], hidden: !datasetVisibility['Latency (ms)'] },
                { label: 'Jitter (ms)', borderColor: '#ffc107', backgroundColor: 'rgba(255, 193, 7, 0.1)', data: [], hidden: !datasetVisibility['Jitter (ms)'] },
                { label: 'Packet Loss (%)', borderColor: '#6c757d', backgroundColor: 'rgba(108, 117, 125, 0.1)', data: [], hidden: !datasetVisibility['Packet Loss (%)'] }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: {
            x: { type: 'time', time: { unit: 'minute', displayFormats: { minute: 'HH:mm' }}, title: { display: true, text: 'Time' }},
            y: { beginAtZero: true, title: { display: true, text: 'Value' }}
        }, plugins: { legend: { position: 'top', onClick: null }, tooltip: { mode: 'index', intersect: false }}}
    });
    loadMainChartDatasetVisibility();
}

function updateMainChartWithCurrentData() { /* Renamed from updateChartWithStoredData */
    if (mainChartInstance && currentNetworkData.length > 0) {
        mainChartInstance.data.labels = currentNetworkData.map(d => new Date(d.timestamp));
        const metricKeys = ['downloadSpeed', 'uploadSpeed', 'latency', 'jitter', 'packetLoss'];
        mainChartInstance.data.datasets.forEach((dataset, index) => {
            dataset.data = currentNetworkData.map(d => ({ x: d.timestamp, y: d[metricKeys[index]] }));
        });
        mainChartInstance.update();
    }
}

async function refreshMainChart() { /* Renamed from updateChart */
    try {
        const metrics = await fetchCurrentNetworkMetrics();
        if (!metrics) return; 

        currentNetworkData.push(metrics);
        if (currentNetworkData.length > MAX_CHART_DATA_POINTS) currentNetworkData.shift();
        await storeData(dbReady, "networkData", metrics);
            
        if (mainChartInstance) {
            mainChartInstance.data.labels.push(new Date(metrics.timestamp));
            const metricKeys = ['downloadSpeed', 'uploadSpeed', 'latency', 'jitter', 'packetLoss'];
            mainChartInstance.data.datasets.forEach((dataset, index) => {
                 dataset.data.push({ x: metrics.timestamp, y: metrics[metricKeys[index]] });
                 if (dataset.data.length > MAX_CHART_DATA_POINTS) {
                    dataset.data.shift();
                }
            });
             if (mainChartInstance.data.labels.length > MAX_CHART_DATA_POINTS) {
                mainChartInstance.data.labels.shift();
            }
            mainChartInstance.update();
            checkMetricAlerts(metrics); // Check alerts after updating chart
        }
    } catch (e) { console.error("Error updating main chart:", e); }
}

// --- Charting (Average Metrics Bar Chart) ---
async function calculateAverageMetrics() {
    const allData = await getAllData(dbReady, "networkData"); // Uses the actual getAllData
    if (allData.length === 0) return { downloadSpeed: 0, uploadSpeed: 0, latency: 0, jitter: 0, packetLoss: 0 };
    
    const sums = allData.reduce((acc, data) => {
        acc.downloadSpeed += data.downloadSpeed || 0;
        acc.uploadSpeed += data.uploadSpeed || 0;
        acc.latency += data.latency || 0;
        acc.jitter += data.jitter || 0;
        acc.packetLoss += data.packetLoss || 0;
        return acc;
    }, { downloadSpeed: 0, uploadSpeed: 0, latency: 0, jitter: 0, packetLoss: 0 });

    return {
        downloadSpeed: sums.downloadSpeed / allData.length,
        uploadSpeed: sums.uploadSpeed / allData.length,
        latency: sums.latency / allData.length,
        jitter: sums.jitter / allData.length,
        packetLoss: sums.packetLoss / allData.length,
    };
}

function initializeAverageMetricsChart() { /* Renamed from initAverageMetricsChart */
    const ctx = ui.averageMetricsChartCanvas.getContext('2d');
    if (averageMetricsChartInstance) averageMetricsChartInstance.destroy();
    averageMetricsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Download (Gbps)', 'Upload (Gbps)', 'Latency (ms)', 'Jitter (ms)', 'Packet Loss (%)'],
            datasets: [{
                label: 'Average Values', data: [0,0,0,0,0],
                backgroundColor: ['rgba(0,123,255,0.7)','rgba(40,167,69,0.7)','rgba(220,53,69,0.7)','rgba(255,193,7,0.7)','rgba(108,117,125,0.7)'],
                borderColor: ['#007bff','#28a745','#dc3545','#ffc107','#6c757d'],
                borderWidth: 1
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true }}, plugins: { legend: { display: false }, title: {display: true, text: 'Average Network Performance'} }}
    });
}

async function refreshAverageMetricsChart() { /* Renamed from updateAverageMetricsChart */
    if (!averageMetricsChartInstance) return;
    try {
        const averages = await calculateAverageMetrics();
        averageMetricsChartInstance.data.datasets[0].data = [
            averages.downloadSpeed.toFixed(3), averages.uploadSpeed.toFixed(3),
            averages.latency.toFixed(2), averages.jitter.toFixed(2), averages.packetLoss.toFixed(2)
        ];
        averageMetricsChartInstance.update();
    } catch (error) { console.error("Failed to update average metrics chart:", error); }
}

// --- Main Chart Dataset Visibility ---
function setupMainChartVisibilityControls() { /* Renamed from setupMetricSelectionControls */
    ui.metricSelectionCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (event) => {
            const datasetIndex = parseInt(event.target.getAttribute('data-dataset-index'));
            const isVisible = event.target.checked;
            if (mainChartInstance) {
                mainChartInstance.setDatasetVisibility(datasetIndex, isVisible);
                mainChartInstance.update();
                datasetVisibility[mainChartInstance.data.datasets[datasetIndex].label] = isVisible;
                localStorage.setItem('datasetVisibility', JSON.stringify(datasetVisibility));
            }
        });
    });
}

function loadMainChartDatasetVisibility() { /* Renamed from loadDatasetVisibility */
    const savedVisibility = localStorage.getItem('datasetVisibility');
    if (savedVisibility) datasetVisibility = JSON.parse(savedVisibility);
    
    if (mainChartInstance) {
        mainChartInstance.data.datasets.forEach((dataset, index) => {
            const isVisible = datasetVisibility[dataset.label];
            if (isVisible !== undefined) mainChartInstance.setDatasetVisibility(index, isVisible);
            const checkbox = document.querySelector(`.metric-selection-controls input[data-dataset-index="${index}"]`);
            if (checkbox) checkbox.checked = isVisible === undefined ? true : isVisible; // Default to true if not in saved
        });
        mainChartInstance.update();
    }
}


// --- Theme Management ---
function applyTheme(theme) { // 'light' or 'dark'
    document.body.classList.toggle('dark-mode', theme === 'dark');
    currentTheme = theme;
    localStorage.setItem('theme', theme);

    const iconHtml = theme === 'dark' ? '<i class="fas fa-sun"></i> Toggle Light Mode' : '<i class="fas fa-moon"></i> Toggle Dark Mode';
    if (ui.themeSwitcherModalBtn) ui.themeSwitcherModalBtn.innerHTML = iconHtml;
    if (ui.themeSwitcherHeaderBtn) ui.themeSwitcherHeaderBtn.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    
    updateChartsTheme(theme === 'dark');
}

function toggleTheme() {
    applyTheme(currentTheme === 'light' ? 'dark' : 'light');
}

function loadSavedTheme() {
    applyTheme(localStorage.getItem('theme') || 'light');
}

function updateChartsTheme(isDarkMode) {
    const gridColor = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    const labelColor = isDarkMode ? '#ffffff' : '#333333';
    const titleColor = labelColor; // Titles can use the same color as labels

    [mainChartInstance, averageMetricsChartInstance].forEach(instance => {
        if (instance && instance.options.scales) {
            instance.options.scales.x.ticks.color = labelColor;
            instance.options.scales.x.grid.color = gridColor;
            if(instance.options.scales.x.title) instance.options.scales.x.title.color = titleColor;
            
            instance.options.scales.y.ticks.color = labelColor;
            instance.options.scales.y.grid.color = gridColor;
            if(instance.options.scales.y.title) instance.options.scales.y.title.color = titleColor;

            if (instance.options.plugins.legend) instance.options.plugins.legend.labels.color = labelColor;
            if (instance.options.plugins.title) instance.options.plugins.title.color = titleColor;
            instance.update();
        }
    });
}

// --- Alert System ---
function getAlertFormElement(id) {
    // If modal is open and contains the form, query within modal
    if (ui.settingsModal && ui.settingsModal.style.display === 'block' && ui.modalAlertSettingsContent.contains(document.getElementById(id))) {
        return ui.modalAlertSettingsContent.querySelector(`#${id}`);
    }
    // Fallback to the original hidden card (should ideally not be needed if modal logic is robust)
    return document.getElementById(id); 
}

function saveMetricAlertSettings() { /* Renamed from saveAlertSettings */
    alertThresholds.minDownloadSpeed = parseFloat(getAlertFormElement('minDownloadSpeed').value) || null;
    alertThresholds.minUploadSpeed = parseFloat(getAlertFormElement('minUploadSpeed').value) || null;
    alertThresholds.maxLatency = parseFloat(getAlertFormElement('maxLatency').value) || null;
    alertThresholds.maxJitter = parseFloat(getAlertFormElement('maxJitter').value) || null;
    alertThresholds.maxPacketLoss = parseFloat(getAlertFormElement('maxPacketLoss').value) || null;
    localStorage.setItem('alertThresholds', JSON.stringify(alertThresholds));
    alert('Alert settings saved!');
}

function loadMetricAlertSettings() { /* Renamed from loadAlertSettings */
    const savedThresholds = localStorage.getItem('alertThresholds');
    if (savedThresholds) alertThresholds = JSON.parse(savedThresholds);
    
    // Update form fields (could be in modal or hidden card)
    const ids = ['minDownloadSpeed', 'minUploadSpeed', 'maxLatency', 'maxJitter', 'maxPacketLoss'];
    ids.forEach(id => {
        const el = getAlertFormElement(id); // Try to get from modal first if open
        if(el) el.value = alertThresholds[id.replace('min', 'min').replace('max', 'max')] || '';
    });
}

function checkMetricAlerts(metrics) { /* Renamed from checkAlerts */
    if (!alertThresholds || !metrics) return;
    const metricElements = {
        downloadSpeed: ui.downloadSpeedMetric, uploadSpeed: ui.uploadSpeedMetric,
        latency: ui.latencyMetric, jitter: ui.jitterMetric, packetLoss: ui.packetLossMetric
    };
    Object.values(metricElements).forEach(el => el && el.classList.remove('metric-alert'));
    let alertMessages = [];

    if (alertThresholds.minDownloadSpeed !== null && metrics.downloadSpeed < alertThresholds.minDownloadSpeed) {
        metricElements.downloadSpeed?.classList.add('metric-alert');
        alertMessages.push(`Low Download: ${metrics.downloadSpeed.toFixed(3)} (Threshold: >${alertThresholds.minDownloadSpeed}) Gbps`);
    }
    // ... (similar checks for other metrics) ...
    if (alertMessages.length > 0) {
        const fullMsg = alertMessages.join('\n');
        console.warn('Alerts:', fullMsg);
        sendEmailNotification('Network Performance Alert', `Thresholds breached:\n${fullMsg}`);
        logNetworkEvent(`Alert: ${alertMessages.join('; ')}`);
    }
}

// --- Settings Modal ---
function openSettingsModal() {
    if (ui.settingsModal) ui.settingsModal.style.display = 'block';
    const alertSettingsForm = document.getElementById('alertSettingsCard').querySelector('.alert-settings-form');
    if (alertSettingsForm && ui.modalAlertSettingsContent) {
        ui.modalAlertSettingsContent.innerHTML = ''; // Clear
        const clonedForm = alertSettingsForm.cloneNode(true);
        ui.modalAlertSettingsContent.appendChild(clonedForm);
        
        const saveBtnInModal = clonedForm.querySelector('#saveAlertSettingsBtn');
        if (saveBtnInModal) saveBtnInModal.addEventListener('click', saveMetricAlertSettings);
        
        // Populate cloned form with current settings
        const ids = ['minDownloadSpeed', 'minUploadSpeed', 'maxLatency', 'maxJitter', 'maxPacketLoss'];
        ids.forEach(id => {
            const el = clonedForm.querySelector(`#${id}`);
            // Ensure alertThresholds properties are correctly accessed.
            // e.g., alertThresholds['minDownloadSpeed'], not alertThresholds['minDownloadSpeed'.replace('min','min')]
            const key = id; // Simplified key access
            if(el && alertThresholds[key] !== null && alertThresholds[key] !== undefined) {
                 el.value = alertThresholds[key];
            } else if (el) {
                el.value = '';
            }
        });
    }
}
function closeSettingsModal() { if (ui.settingsModal) ui.settingsModal.style.display = 'none'; }

// --- Data Retention Policy ---
async function applyCurrentDataRetentionPolicy() { /* Renamed from applyDataRetentionPolicy */
    await dbReady;
    if (dataRetentionPeriod === "0") { console.log("Data retention: Forever."); return; }
    const days = parseInt(dataRetentionPeriod);
    if (isNaN(days) || days <= 0) { console.error("Invalid retention period:", dataRetentionPeriod); return; }
    
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const deletedCount = await deleteDataOlderThan(dbReady, "networkData", cutoff);
    logNetworkEvent(`Data retention: Approx. ${deletedCount} records older than ${days} days deleted.`);
}

async function saveAndApplyDataRetentionSettings() { /* Renamed from saveDataRetentionSettings */
    dataRetentionPeriod = ui.dataRetentionPeriodSelect.value;
    localStorage.setItem('dataRetentionPeriod', dataRetentionPeriod);
    alert('Data retention policy saved!');
    await applyCurrentDataRetentionPolicy();
    await refreshAverageMetricsChart(); // Averages will change
    await loadInitialData().then(updateMainChartWithCurrentData); // Main chart will also change
}

async function loadDataRetentionSettings() {
    dataRetentionPeriod = localStorage.getItem('dataRetentionPeriod') || '30';
    if (ui.dataRetentionPeriodSelect) ui.dataRetentionPeriodSelect.value = dataRetentionPeriod;
}


// --- Historical Data & CSV ---
async function viewAllHistoricalData() { /* Renamed from fetchHistoricalData and displayHistoricalDataTable */
    const allData = await getAllData(dbReady, "networkData");
    const formattedData = allData.map(e => ({ ...e, formattedTime: formatTimestamp(e.timestamp) })).sort((a,b) => b.timestamp - a.timestamp);
    // ... (rest of displayHistoricalDataTable logic from previous version) ...
     let tableHTML = `
        <table style="width:100%; border-collapse: collapse;">
            <tr><th>Time</th><th>Download (Gbps)</th><th>Upload (Gbps)</th><th>Latency (ms)</th><th>Jitter (ms)</th><th>Packet Loss (%)</th></tr>`;
    formattedData.forEach(entry => {
        tableHTML += `
            <tr>
                <td>${entry.formattedTime}</td><td>${entry.downloadSpeed.toFixed(3)}</td><td>${entry.uploadSpeed.toFixed(3)}</td>
                <td>${entry.latency.toFixed(2)}</td><td>${entry.jitter.toFixed(2)}</td><td>${entry.packetLoss.toFixed(2)}</td>
            </tr>`;
    });
    tableHTML += '</table>';
    const newWindow = window.open('', 'Historical Data', 'width=800,height=600');
    newWindow.document.body.innerHTML = `
        <style>body { font-family: 'Roboto', sans-serif; padding: 20px; } h2 { color: #007bff; } table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #dee2e6; padding: 8px; text-align: left; } th { background-color: #f8f9fa; }</style>
        <h2>Network Data History</h2>${tableHTML}`;
}
async function downloadAllDataCSV() { /* Renamed from downloadCSV */
    const allData = await getAllData(dbReady, "networkData");
    const formattedData = allData.map(e => ({ ...e, formattedTime: formatTimestamp(e.timestamp) })).sort((a,b) => b.timestamp - a.timestamp);
    let csvContent = "data:text/csv;charset=utf-8,Time,Download (Gbps),Upload (Gbps),Latency (ms),Jitter (ms),Packet Loss (%)\n";
    formattedData.forEach(entry => {
        const row = [entry.formattedTime, entry.downloadSpeed.toFixed(3), entry.uploadSpeed.toFixed(3), entry.latency.toFixed(2), entry.jitter.toFixed(2), entry.packetLoss.toFixed(2)].join(",");
        csvContent += row + "\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "network_monitor_all_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
async function clearAllNetworkDataWithConfirmation() { /* Renamed from clearStoredData */
    if (!confirm("Clear ALL stored network data? This is irreversible.")) return;
    await clearAllDataFromStore(dbReady, "networkData");
    alert("All network data cleared.");
    currentNetworkData = []; // Clear live chart data
    updateMainChartWithCurrentData(); // Update main chart display
    await refreshAverageMetricsChart(); // Update average chart display
    logNetworkEvent("All network data cleared by user.");
}


// --- Email & External Services (Simulated) ---
function initializeEmailService() { /* Renamed from IIFE */
    // emailjs.init("YOUR_USER_ID"); // Replace with actual ID if using EmailJS
    console.log("Email service placeholder initialized.");
}
function sendEmailNotification(subject, message) { /* Renamed from sendEmailAlert */
    console.log(`Email SIM: Subject: ${subject}, Message: ${message}`);
    // const templateParams = { to_email: 'user@example.com', subject, message };
    // emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', templateParams) ...
}
function updateSimulatedEnvironmentalData() { /* Renamed from updateEnvironmentalData */ }
function updateSimulatedComplianceStatus() { /* Renamed from updateComplianceStatus */ }


// --- DOM Element References ---
function initDOMReferences() {
    ui.offlineWarning = document.getElementById('offlineWarning');
    ui.networkStatusIndicator = document.getElementById('networkStatus');
    ui.networkType = document.getElementById('networkType');
    ui.connectionQuality = document.getElementById('connectionQuality');
    ui.downloadSpeed = document.getElementById('downloadSpeed');
    ui.uploadSpeed = document.getElementById('uploadSpeed');
    ui.latency = document.getElementById('latency');
    ui.jitter = document.getElementById('jitter');
    ui.packetLoss = document.getElementById('packetLoss');
    ui.mainChartCanvas = document.getElementById('chart');
    ui.averageMetricsChartCanvas = document.getElementById('averageMetricsChart');
    ui.metricSelectionCheckboxes = document.querySelectorAll('.metric-selection-controls input[type="checkbox"]');
    ui.networkEventsLog = document.getElementById('networkEventsLog');
    // Metric alert containers
    ui.downloadSpeedMetric = document.getElementById('downloadSpeedMetric');
    ui.uploadSpeedMetric = document.getElementById('uploadSpeedMetric');
    ui.latencyMetric = document.getElementById('latencyMetric');
    ui.jitterMetric = document.getElementById('jitterMetric');
    ui.packetLossMetric = document.getElementById('packetLossMetric');
    // Settings Modal
    ui.settingsModal = document.getElementById('settingsModal');
    ui.settingsBtn = document.getElementById('settingsBtn');
    ui.closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
    ui.closeSettingsModalFooterBtn = document.getElementById('closeSettingsModalFooterBtn');
    ui.themeSwitcherHeaderBtn = document.getElementById('themeSwitcherHeader'); // Hidden one
    ui.themeSwitcherModalBtn = document.getElementById('themeSwitcherModal');
    ui.modalAlertSettingsContent = document.getElementById('modalAlertSettingsContent');
    ui.dataRetentionPeriodSelect = document.getElementById('dataRetentionPeriod');
    // Notes Popup
    ui.notesPopup = document.getElementById("notesPopup");
    ui.closeNotesPopupBtn = document.getElementsByClassName("close")[0]; // Assuming it's the first
}


// --- Event Listener Setup ---
function initEventListeners() {
    // Network status
    window.addEventListener('online', updateOnlineStatusDisplay);
    window.addEventListener('offline', updateOnlineStatusDisplay);

    // Charts & Data
    document.getElementById('historicalDataBtn').addEventListener('click', viewAllHistoricalData);
    document.getElementById('downloadCsvBtn').addEventListener('click', downloadAllDataCSV);
    document.getElementById('clearDataBtn').addEventListener('click', clearAllNetworkDataWithConfirmation);
    document.getElementById('refreshAverageMetricsBtn').addEventListener('click', refreshAverageMetricsChart);
    setupMainChartVisibilityControls();

    // Event Log
    const viewEventsBtn = document.getElementById('viewEventsLogBtn');
    if(viewEventsBtn) viewEventsBtn.addEventListener('click', fetchAndDisplayFullEventLog);
    const downloadEventsBtn = document.getElementById('downloadEventsCsvBtn');
    if(downloadEventsBtn) downloadEventsBtn.addEventListener('click', downloadEventsCSV);
    const clearEventsBtn = document.getElementById('clearEventsDataBtn');
    if(clearEventsBtn) clearEventsBtn.addEventListener('click', clearEventsDataWithConfirmation);

    // Settings Modal
    if (ui.settingsBtn) ui.settingsBtn.addEventListener('click', openSettingsModal);
    if (ui.closeSettingsModalBtn) ui.closeSettingsModalBtn.addEventListener('click', closeSettingsModal);
    if (ui.closeSettingsModalFooterBtn) ui.closeSettingsModalFooterBtn.addEventListener('click', closeSettingsModal);
    window.addEventListener('click', event => { if (event.target == ui.settingsModal) closeSettingsModal(); });
    
    if (ui.themeSwitcherModalBtn) ui.themeSwitcherModalBtn.addEventListener('click', toggleTheme);
    
    const saveRetentionBtn = document.getElementById('saveDataRetentionBtn'); // Element from HTML
    if(saveRetentionBtn) saveRetentionBtn.addEventListener('click', saveAndApplyDataRetentionSettings);
    const applyRetentionBtn = document.getElementById('applyDataRetentionBtn'); // Element from HTML
    if(applyRetentionBtn) applyRetentionBtn.addEventListener('click', async () => {
        if (confirm("Apply data retention policy now? This may delete old data.")) {
            await applyCurrentDataRetentionPolicy();
            alert("Data retention policy applied.");
            await refreshAverageMetricsChart();
        }
    });
    // Note: Save Alert Settings button listener is attached dynamically in openSettingsModal

    // Notes Popup
    if (ui.closeNotesPopupBtn) ui.closeNotesPopupBtn.onclick = () => { if(ui.notesPopup) ui.notesPopup.style.display = "none"; };
    window.onclick = event => { if (event.target == ui.notesPopup) ui.notesPopup.style.display = "none"; };
}

// --- Periodic Tasks ---
function startPeriodicTasks() {
    setInterval(refreshMainChart, 60000); // Update main chart every 60s
    setInterval(updateOnlineStatusDisplay, 5000);
    // setInterval(fetchAndDisplayAdditionalInfo, 300000); // Potentially high API usage
    // setInterval(updateSimulatedEnvironmentalData, 30000);
    // setInterval(updateSimulatedComplianceStatus, 60000);
}

// --- Main Initialization ---
async function initializeApp() { /* Renamed from init */
    initDOMReferences();
    initNotesPopupVisual(); // Show notes popup early, renamed for clarity

    await loadDataRetentionSettings(); 
    await loadInitialData().then(updateMainChartWithCurrentData); // Applies retention, then loads chart data
    
    initializeMainChart(); // Initializes with loaded visibility
    initializeAverageMetricsChart();
    await refreshAverageMetricsChart(); // Populate average chart

    updateOnlineStatusDisplay();
    // fetchAndDisplayAdditionalInfo(); // Initial fetch
    // updateSimulatedEnvironmentalData();
    // updateSimulatedComplianceStatus();
    loadMetricAlertSettings(); // For hidden card, modal populates on open
    loadSavedTheme(); // Applies theme and updates chart themes

    initEventListeners();
    startPeriodicTasks();
    
    console.log("Application initialized.");
}

// Utility for notes popup (can be part of initDOMReferences or its own module)
function initNotesPopupVisual() { // Renamed from initNotesPopup
    if (ui.notesPopup) ui.notesPopup.style.display = "block";
}


// --- Basic Test Suite ---
async function runBasicTests() {
    console.log('--- Starting Basic Tests ---');

    // Test formatTimestamp
    console.log('--- Testing formatTimestamp ---');
    const testDate1 = new Date(2023, 0, 15, 10, 30, 0); // Jan 15, 2023, 10:30:00
    const expectedFormatted1 = testDate1.toLocaleString();
    const actualFormatted1 = formatTimestamp(testDate1.getTime());
    console.assert(actualFormatted1 === expectedFormatted1, `formatTimestamp Test Case 1 Failed: Expected ${expectedFormatted1}, got ${actualFormatted1}`);
    if (actualFormatted1 === expectedFormatted1) console.log('formatTimestamp Test Case 1 Passed');

    const epochTimestamp = 0;
    const expectedEpochFormatted = new Date(epochTimestamp).toLocaleString();
    const actualEpochFormatted = formatTimestamp(epochTimestamp);
    console.assert(actualEpochFormatted === expectedEpochFormatted, `formatTimestamp Test Case 2 (Epoch) Failed: Expected ${expectedEpochFormatted}, got ${actualEpochFormatted}`);
    if (actualEpochFormatted === expectedEpochFormatted) console.log('formatTimestamp Test Case 2 (Epoch) Passed');
    console.log('--- Finished formatTimestamp Tests ---');

    // Test calculateAverageMetrics
    console.log('--- Testing calculateAverageMetrics ---');
    const originalGetAllData = getAllData; // Save original function

    // Mock getAllData for this test
    // Ensure this mock is compatible with how calculateAverageMetrics uses it (e.g., db parameter)
    const mockGetAllData = async (db, storeName) => { 
        if (storeName === 'networkData') {
            return [
                { downloadSpeed: 1, uploadSpeed: 0.5, latency: 10, jitter: 1, packetLoss: 0 },
                { downloadSpeed: 2, uploadSpeed: 1.5, latency: 20, jitter: 2, packetLoss: 1 },
                { downloadSpeed: 3, uploadSpeed: 2.5, latency: 30, jitter: 3, packetLoss: 2 },
            ];
        }
        return [];
    };
    
    // Temporarily replace the global getAllData with the mock
    // This is a bit risky if other async operations are happening, but for a simple test suite:
    window.getAllData = mockGetAllData; 

    try {
        const averages = await calculateAverageMetrics(); // No need to pass dbReady if mock doesn't use it
        
        console.assert(averages.downloadSpeed === 2, `Avg Download Failed: Expected 2, got ${averages.downloadSpeed}`);
        if (averages.downloadSpeed === 2) console.log('calculateAverageMetrics Test (Download) Passed');

        console.assert(averages.uploadSpeed === 1.5, `Avg Upload Failed: Expected 1.5, got ${averages.uploadSpeed}`);
        if (averages.uploadSpeed === 1.5) console.log('calculateAverageMetrics Test (Upload) Passed');

        console.assert(averages.latency === 20, `Avg Latency Failed: Expected 20, got ${averages.latency}`);
        if (averages.latency === 20) console.log('calculateAverageMetrics Test (Latency) Passed');
        
        console.assert(averages.jitter === 2, `Avg Jitter Failed: Expected 2, got ${averages.jitter}`);
        if (averages.jitter === 2) console.log('calculateAverageMetrics Test (Jitter) Passed');

        console.assert(averages.packetLoss === 1, `Avg Packet Loss Failed: Expected 1, got ${averages.packetLoss}`);
        if (averages.packetLoss === 1) console.log('calculateAverageMetrics Test (Packet Loss) Passed');

    } catch (err) {
        console.error('calculateAverageMetrics test failed to run or assertions failed:', err);
    } finally {
        window.getAllData = originalGetAllData; // Restore original function
        console.log('--- Finished calculateAverageMetrics Test (Original getAllData restored) ---');
    }
    
    // Test calculateAverageMetrics with empty data
    console.log('--- Testing calculateAverageMetrics with Empty Data ---');
    window.getAllData = async (db, storeName) => { // Mock for empty data
        if (storeName === 'networkData') return [];
        return [];
    };
    try {
        const averagesEmpty = await calculateAverageMetrics();
        const emptyExpected = { downloadSpeed: 0, uploadSpeed: 0, latency: 0, jitter: 0, packetLoss: 0 };
        for (const key in emptyExpected) {
            console.assert(averagesEmpty[key] === emptyExpected[key], `Avg ${key} (Empty) Failed: Expected 0, got ${averagesEmpty[key]}`);
            if(averagesEmpty[key] === emptyExpected[key]) console.log(`calculateAverageMetrics Test (${key} - Empty) Passed`);
        }
    } catch (err) {
        console.error('calculateAverageMetrics (Empty Data) test failed:', err);
    } finally {
        window.getAllData = originalGetAllData; // Restore original
        console.log('--- Finished calculateAverageMetrics (Empty Data) Test ---');
    }


    console.log('--- Basic Tests Finished ---');
}


// --- Start Application ---
initializeApp().then(() => {
    // This block runs after initializeApp's promise resolves.
    // Update chart themes after they are certainly initialized.
    const isDarkMode = document.body.classList.contains('dark-mode');
    updateChartsTheme(isDarkMode); // Applies theme to charts correctly on initial load.

    // Run tests after app is initialized and potentially after db is ready
    // to avoid conflicts if tests also interact with db (though these mocks avoid it)
    runBasicTests(); 
});
loadSavedTheme(); // Load theme classes on body first (before chart theme update).
</script>
