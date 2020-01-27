import { UserSetting } from '../../models/user-settings.model';
import { AppMode } from '../../models/app-mode.enum';
import { GeoHazard } from '../../models/geo-hazard.enum';
import { settings } from '../../../../settings';
import { TopoMap } from '../../models/topo-map.enum';
import { LangKey } from '../../models/langKey';

export const DEFAULT_USER_SETTINGS: () => UserSetting = () => ({
    appMode: AppMode.Prod,
    language: LangKey.nb,
    currentGeoHazard: [GeoHazard.Snow],
    observationDaysBack: [
        { geoHazard: GeoHazard.Snow, daysBack: 2 },
        { geoHazard: GeoHazard.Ice, daysBack: 7 },
        { geoHazard: GeoHazard.Dirt, daysBack: 3 },
        { geoHazard: GeoHazard.Water, daysBack: 3 },
    ],
    completedStartWizard: false,
    supportTiles: [],
    showMapCenter: false,
    tilesCacheSize: settings.map.tiles.cacheSize,
    showObservations: true,
    emailReceipt: true,
    topoMap: TopoMap.mixArcGisOnline,
    showGeoSelectInfo: true,
    useRetinaMap: false,
    consentForSendingAnalytics: true,
    consentForSendingAnalyticsDialogCompleted: false,
    featureToggeGpsDebug: false,
    featureToggleDeveloperMode: false,
});