// Updated FeatureServer Layer IDs
const layerIds = {
    FIR: 0,
    LowFlyingArea: 1,
    ProhibitedArea: 19,
    RestrictedArea: 18,
    DangerArea: 17,
    TSA: 3,
    TRA: 5,
    Parajump: 6,
    ClimbArea: 16,
    ATZ: 7,
    TMZ_RTMZ: 8,
    HPZ_HTZ: 9,
    RMZ: 10,
    GliderArea: 11,
    VFRArea: 12,
    IFRArea: 20,
    DelegatedArea: 21,
    ACCSectorExcludingDelegations: 23,
    ACCSectorIncludingDelegations: 22,
    CTA: 13,
    TMA: 14,
    CTR: 15
};

// ArcGIS REST query modifications
const queryLayer = (layerId, resultOffset = 0, resultRecordCount = 100) => {
    const url = `https://example.com/FeatureServer/${layerId}/query?f=json&resultOffset=${resultOffset}&resultRecordCount=${resultRecordCount}`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if(data && data.features) {
                // Render features using Leaflet
                renderFeatures(data.features);
            }
        })
        .catch(error => console.error('Error fetching data:', error));
};

// Detect maxRecordCount from the service (simplified here)
const getMaxRecordCount = async (layerId) => {
    const url = `https://example.com/FeatureServer/${layerId}?f=json`;
    const response = await fetch(url);
    const data = await response.json();
    return data.maxRecordCount || 100; // Defaulting to 100 if not specified
};

// Usage example:
const layerId = layerIds.FIR;  // Example for FIR
const maxCount = await getMaxRecordCount(layerId);
queryLayer(layerId, 0, maxCount);