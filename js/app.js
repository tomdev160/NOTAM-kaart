<!DOCTYPE html>
<html>
<head>
    <title>Leaflet Map</title>
    <link rel="stylesheet" href="css/style.css">
    <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
    <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
    <script src="https://unpkg.com/axios/dist/axios.min.js"></script>
</head>
<body>
    <div id="map" style="height: 600px;"></div>
    <div id="status"></div>
    <script>
        const map = L.map('map').setView([51.505, -0.09], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

        const layerIds = { prohibited: 19, ctr: 15, restricted: 18, tsa: 3 };
        let layerGroup = L.layerGroup().addTo(map);
        document.getElementById('status').textContent = 'Loading data...';

        const fetchGeoJSON = async (layerId, offset = 0, limit = 1000) => {
            try {
                const response = await axios.get(`https://services-eu1.arcgis.com/OtUwzhpKSdeXgRIB/ArcGIS/rest/services/Airspaces_data/FeatureServer/${layerId}/query`, {
                    params: {
                        f: 'geojson',
                        where: '1=1',
                        resultOffset: offset,
                        resultRecordCount: limit,
                        outFields: '*'
                    },
                    headers: { 'Content-Type': 'application/json' }
                });

                return response.data;
            } catch (error) {
                console.error('Error fetching GeoJSON:', error);
                document.getElementById('status').textContent = 'Error loading data.';
                throw error;
            }
        };

        const loadLayers = async (layerId) => {
            const metadataResponse = await axios.get(`https://services-eu1.arcgis.com/OtUwzhpKSdeXgRIB/ArcGIS/rest/services/Airspaces_data/FeatureServer/${layerId}`);
            const maxRecordCount = metadataResponse.data.maxRecordCount;
            let offset = 0;
            let dataFetched = true;

            while (dataFetched) {
                const geojson = await fetchGeoJSON(layerId, offset, maxRecordCount);
                if (geojson.features.length > 0) {
                    layerGroup.addLayer(L.geoJSON(geojson));
                    offset += maxRecordCount;
                } else {
                    dataFetched = false;
                }
            }
            document.getElementById('status').textContent = 'Data loaded.';
        };

        // Toggle layers based on button clicks (pseudo code)
        const toggleLayer = (layerId) => {
            if (layerGroup) {
                layerGroup.clearLayers();
                loadLayers(layerId);
            }
        };

        // Example buttons to toggle layers
        // document.getElementById('btn_prohibited').onclick = () => toggleLayer(layerIds.prohibited);
        // document.getElementById('btn_ctr').onclick = () => toggleLayer(layerIds.ctr);
        // document.getElementById('btn_restricted').onclick = () => toggleLayer(layerIds.restricted);
        // document.getElementById('btn_tsa').onclick = () => toggleLayer(layerIds.tsa);

        // Load a default layer on start
        loadLayers(layerIds.prohibited);
    </script>
</body>
</html>