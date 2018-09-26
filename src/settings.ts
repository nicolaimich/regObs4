
export const settings = {
    observations: {
        maxObservationsToFetch: 1000,
        daysBackToKeepBeforeCleanup: 30,
        timeZone: 'Europe/Oslo'
    },
    services: {
        regObs: {
            apiUrl: {
                'PROD': 'https://api.nve.no/hydrology/regobs/webapi_v3.2.0',
                'DEMO': 'https://api.nve.no/hydrology/demo/regobs/webapi_v3.2',
                'TEST': 'http://tst-h-web03.nve.no/regobswebapi'
            },
            serviceUrl: {
                'PROD': 'https://api.nve.no/hydrology/regobs/v3.1.0/',
                'DEMO': 'http://stg-h-web03.nve.no/RegObsServices/',
                'TEST': 'http://tst-h-web03.nve.no/regobsservices_test/'
            },
            apiJsonVersion: '3.2.0',
        },
        warning: {
            defaultWarningDaysAhead: 3,
            Snow: {
                apiUrl: 'https://api01.nve.no/hydrology/forecast/avalanche/v4.0.0/api'
            }
        }
    },
    db: {
        simpleStorage: {
            dbName: 'regobsSimpleStorage',
            location: 'default'
        },
        nanoSql: {
            dbName: 'nanoSql',
            tableName: 'registration'
        }
    },
    map: {
        tiles: {
            embeddedUrl: '/assets/map/{z}/tile_{x}_{y}.png',
            embeddedUrlMaxZoom: 5,
            defaultMapUrl: 'http://opencache.statkart.no/gatekeeper/gk/gk.open_gmaps?layers=norgeskart_bakgrunn&zoom={z}&x={x}&y={y}',
            fallbackMapUrl: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
            supportTiles: [
                {
                    name: 'steepness',
                    description: 'STEEPNESS_MAP_DESCRIPTION',
                    url: 'http://gis3.nve.no/arcgis/rest/services/wmts/Bratthet/MapServer/tile/{z}/{y}/{x}',
                    enabled: true,
                    opacity: 0.5,
                    geoHazardId: 10
                },
                {
                    name: 'clayzones',
                    description: 'CLAY_ZONES_MAP_DESCRIPTION',
                    url: 'http://gis2.nve.no/arcgis/rest/services/wmts/Kvikkleire_Jordskred/MapServer/tile/{z}/{y}/{x}',
                    enabled: true,
                    opacity: 0.5,
                    geoHazardId: 20
                },
                {
                    name: 'floodzoones',
                    description: 'FLOOD_ZONES_MAP_DESCRIPTION',
                    url: 'http://gis3.nve.no/arcgis/rest/services/wmts/Flomsoner1/MapServer/tile/{z}/{y}/{x}',
                    enabled: true,
                    opacity: 0.5,
                    geoHazardId: 60
                },
                {
                    name: 'weakenedice',
                    description: 'WEAKENED_ICE_MAP_DESCRIPTION',
                    url: 'http://gis3.nve.no/arcgis/rest/services/wmts/SvekketIs/MapServer/tile/{z}/{y}/{x}',
                    enabled: true,
                    opacity: 0.5,
                    geoHazardId: 70
                }
            ]
        },
        search: {
            no: {
                url: 'https://ws.geonorge.no/SKWS3Index/ssr/sok',
                maxResults: 20,
                exactFirst: true,
            },
            world: {
                url: 'https://secure.geonames.org/searchJSON',
                maxResults: 20,
                username: 'regobs',
            }
        }
    },
    snowRegionsGeoJsonName: 'OMRAADENAV',
    events: {
        nanosqlConnected: 'nanoSql:connected',
        tabsChanged: 'tabs:changed',
        geoHazardChanged: 'geoHazard:changed',
        fullscreenChanged: 'fullscreen:changed',
        centerMapToUser: 'gps:centerMapToUser',
        supportTilesChanged: 'supportTiles:changed',
        mapSearchItemClicked: 'mapSearchItem:clicked',
        userSettingsChanged: 'userSettings:changed',
        geolocationUpdate: 'gps:locationUpdate'
    },
    cordovaNotAvailable: 'cordova_not_available',
    gps: {
        maximumAge: 180000
    }
};
