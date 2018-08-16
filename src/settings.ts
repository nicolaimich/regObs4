
export const settings = {
    observations: {
        maxObservationsToFetch: 1000
    },
    services: {
        apiUrl: {
            'PROD': 'https://api.nve.no/hydrology/regobs/webapi_v3.2.0',
            'DEMO': 'https://api.nve.no/hydrology/demo/regobs/webapi_v3.2',
            'TEST': 'http://tst-h-web03.nve.no/regobswebapi'
        }
    },
    db: {
        name: 'regobsDb',
        location: 'default'
    }
};
