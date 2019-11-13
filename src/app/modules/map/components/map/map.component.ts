import { Component, OnInit, Input, NgZone, OnDestroy, AfterViewInit, Output, EventEmitter } from '@angular/core';
import * as L from 'leaflet';
import { UserSettingService } from '../../../../core/services/user-setting/user-setting.service';
import { Subscription, timer } from 'rxjs';
import { Platform, AlertController } from '@ionic/angular';
import { UserSetting } from '../../../../core/models/user-settings.model';
import { settings } from '../../../../../settings';
import { Geolocation, Geoposition } from '@ionic-native/geolocation/ngx';
import { UserMarker } from '../../../../core/helpers/leaflet/user-marker/user-marker';
import { MapService } from '../../services/map/map.service';
import { take, takeWhile, tap, pairwise } from 'rxjs/operators';
import { FullscreenService } from '../../../../core/services/fullscreen/fullscreen.service';
import { LoggingService } from '../../../shared/services/logging/logging.service';
import { MapSearchService } from '../../services/map-search/map-search.service';
import { TopoMap } from '../../../../core/models/topo-map.enum';
import { RegObsTileLayer, IRegObsTileLayerOptions } from '../../core/classes/regobs-tile-layer';
import '../../../../core/helpers/ionic/platform-helper';
import { NORWEGIAN_BOUNDS } from '../../../../core/helpers/leaflet/border-helper';
import { OfflineMapService } from '../../../../core/services/offline-map/offline-map.service';
import { Diagnostic } from '@ionic-native/diagnostic/ngx';
import { TranslateService } from '@ngx-translate/core';

const DEBUG_TAG = 'MapComponent';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss']
})
export class MapComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() showMapControls = true;
  @Input() showUserLocation = true;
  @Input() showScale = true;
  @Input() showSupportMaps = true;
  @Input() center: L.LatLng;
  @Input() zoom: number;
  @Input() activateGeoLocationOnStart = true;
  @Output() mapReady: EventEmitter<L.Map> = new EventEmitter();
  @Output() positionChange: EventEmitter<Geoposition> = new EventEmitter();
  loaded = false;

  private map: L.Map;
  private tilesLayer = L.layerGroup();
  private userMarker: UserMarker;
  private firstPositionUpdate = true;

  private geoLoactionSubscription: Subscription;
  private subscriptions: Subscription[] = [];

  private followMode = true;
  private isDoingMoveAction = false;
  private firstClickOnZoomToUser = true;
  private isGeoLocationActive = false;
  private isAskingForPermissions = false;
  private gpsHighAccuracyEnabled = false;

  private setHeadingFunc: (event: DeviceOrientationEvent) => void;

  constructor(
    private userSettingService: UserSettingService,
    private mapService: MapService,
    private offlineMapService: OfflineMapService,
    private mapSearchService: MapSearchService,
    private platform: Platform,
    private zone: NgZone,
    private geolocation: Geolocation,
    private fullscreenService: FullscreenService,
    private loggingService: LoggingService,
    private diagnostic: Diagnostic,
    private alertController: AlertController,
    private translateService: TranslateService,
  ) {
    this.setHeadingFunc = this.setHeading.bind(this);
    // Hack to make sure map pane is set before getPosition
    L.Map.include({
      _getMapPanePos: function () {
        if (this._mapPane === undefined) {
          return new L.Point(0, 0);
        }
        return L.DomUtil.getPosition(this._mapPane) || new L.Point(0, 0);
      },
    });
  }

  options: L.MapOptions = {
    zoom: this.zoom !== undefined ? this.zoom : settings.map.tiles.defaultZoom,
    maxZoom: settings.map.tiles.maxZoom,
    minZoom: settings.map.tiles.minZoom,
    center: this.center || L.latLng(settings.map.unknownMapCenter as L.LatLngTuple),
    bounceAtZoomLimits: false,
    attributionControl: false,
    zoomControl: false,
    maxBounds: new L.LatLngBounds(new L.LatLng(90.0, -180.0), new L.LatLng(-90, 180.0)),
    maxBoundsViscosity: 1.0,
  };

  async ngOnInit() {
    try {
      if (this.center === undefined || this.zoom === undefined) {
        const currentView = await this.mapService.mapView$.pipe(take(1)).toPromise();
        if (currentView && currentView.center) {
          this.firstPositionUpdate = false;
          if (this.center === undefined) {
            this.options.center = currentView.center;
          }
          if (this.zoom === undefined) {
            this.options.zoom = currentView.zoom;
          }
        }
      }
    } finally {
      this.loaded = true;
    }
  }

  ngOnDestroy(): void {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
    this.stopGeoPositionUpdates();
    this.pauseSavingTiles();
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  onLeafletMapReady(map: L.Map) {
    this.map = map;
    if (this.showScale) {
      L.control.scale({ imperial: false }).addTo(map);
    }
    this.tilesLayer.addTo(this.map);

    this.subscriptions.push(this.userSettingService.userSettingObservable$.subscribe((userSetting) => {
      this.configureTileLayers(userSetting);
      if (userSetting.showMapCenter) {
        this.updateMapView();
      }
    }));

    this.subscriptions.push(this.mapService.followMode$.subscribe((val) => {
      this.followMode = val;
      this.loggingService.debug(`Follow mode changed to: ${this.followMode}`, DEBUG_TAG);
    }));

    this.subscriptions.push(this.mapService.centerMapToUser$.subscribe(() => {
      this.checkPermissionsAndStartGeoPositionUpdates();
    }));

    this.subscriptions.push(this.mapSearchService.mapSearchClick$.subscribe((item) => {
      this.disableFollowMode();
      this.zone.runOutsideAngular(() => {
        const latLng = item instanceof L.LatLng ? item : item.latlng;
        this.flyTo(latLng, settings.map.mapSearchZoomToLevel);
      });
    }));

    this.subscriptions.push(this.mapService.centerMapToUser$.subscribe(() => {
      this.zone.runOutsideAngular(() => {
        if (this.userMarker) {
          const currentPosition = this.userMarker.getPosition();
          const latLng = L.latLng(currentPosition.coords.latitude, currentPosition.coords.longitude);
          if (this.followMode || this.firstClickOnZoomToUser) {
            // Follow mode is allready true or first click, zoom in
            this.flyToMaxZoom(latLng);
          } else {
            // Use existing zoom
            this.flyTo(latLng, this.map.getZoom(), true);
          }
          this.firstClickOnZoomToUser = false;
        }
      });
    }));

    this.zone.runOutsideAngular(() => {
      this.map.on('movestart', () => this.onMapMove());
      this.map.on('zoomstart', () => this.onMapMove());
    });

    this.subscriptions.push(this.platform.pause.pipe(tap(() => {
      this.loggingService.debug('App pause. Stop Geopostioton updates', DEBUG_TAG);
    })).subscribe(() => this.stopGeoPositionUpdates()));
    this.subscriptions.push(this.platform.resume.pipe(tap(() => {
      this.loggingService.debug('App resume. Start Geopostioton updates', DEBUG_TAG);
    })).subscribe(() => this.startGeoPositionUpdates()));

    this.zone.runOutsideAngular(() => {
      this.map.on('moveend', () => this.onMapMoveEnd());
    });

    this.subscriptions.push(this.fullscreenService.isFullscreen$.subscribe(() => {
      this.redrawMap();
    }));

    if (this.activateGeoLocationOnStart) {
      this.startGeoPositionUpdates();
    }

    this.offlineMapService.resumeSavingTiles();

    this.map.on('resize', () => this.updateMapView());
    this.mapReady.emit(this.map);
  }

  resumeSavingTiles() {
    this.offlineMapService.resumeSavingTiles();
  }

  pauseSavingTiles() {
    this.offlineMapService.pauseSavingTiles();
  }

  private onMapMove() {
    this.disableFollowMode();
  }

  private onMapMoveEnd() {
    this.updateMapView();
  }

  private disableFollowMode() {
    if (!this.isDoingMoveAction) {
      this.loggingService.debug('Disable follow mode!', DEBUG_TAG);
      this.mapService.followMode = false;
    } else {
      this.loggingService.debug('Did not disable follow mode, because isDoingMoveAction', DEBUG_TAG);
    }
  }

  private updateMapView() {
    if (this.map) {
      this.mapService.updateMapView({
        bounds: this.map.getBounds(),
        center: this.map.getCenter(),
        zoom: this.map.getZoom(),
      });
    }
  }

  private getTileLayerDefaultOptions(userSetting: UserSetting): IRegObsTileLayerOptions {
    return {
      minZoom: settings.map.tiles.minZoom,
      maxZoom: this.getMaxZoom(userSetting.useRetinaMap),
      maxNativeZoom: settings.map.tiles.maxZoom,
      detectRetina: userSetting.useRetinaMap,
      updateWhenIdle: settings.map.tiles.updateWhenIdle,
      edgeBufferTiles: settings.map.tiles.edgeBufferTiles,
      saveTilesToCache: userSetting.tilesCacheSize > 0,
      saveCacheTileFunc: (id, tile) => this.offlineMapService.saveTileToOfflineCache(id, tile),
      getCacheTileFunc: (id) => this.offlineMapService.getCachedTileDataUrl(id),
      logFunc: this.loggingService.log
    };
  }

  configureTileLayers(userSetting: UserSetting) {
    this.zone.runOutsideAngular(() => {
      this.tilesLayer.clearLayers();
      this.map.setMaxZoom(this.getMaxZoom(userSetting.useRetinaMap));
      const mapOptions = this.getMapOptions(userSetting.topoMap);
      for (const topoMap of mapOptions) {
        const topoTilesLayer = new RegObsTileLayer(
          topoMap.name,
          topoMap.url,
          {
            ...this.getTileLayerDefaultOptions(userSetting),
            bounds: topoMap.bounds,
            excludeBounds: topoMap.notInsideBounds,
          }
        );
        topoTilesLayer.addTo(this.tilesLayer);
      }

      for (const supportTile of this.userSettingService.getSupportTilesOptions(userSetting)) {
        if (supportTile.enabled) {
          const supportMapTileLayer = new RegObsTileLayer(
            supportTile.name,
            supportTile.url,
            {
              ...this.getTileLayerDefaultOptions(userSetting),
              updateInterval: 600,
              keepBuffer: 0,
              updateWhenIdle: true,
              minZoom: settings.map.tiles.minZoomSupportMaps,
              bounds: <any>settings.map.tiles.supportTilesBounds,
            }
          );
          supportMapTileLayer.setOpacity(supportTile.opacity);
          supportMapTileLayer.addTo(this.tilesLayer);
        }
      }
    });
  }

  private getMaxZoom(detectRetina: boolean) {
    return (detectRetina && L.Browser.retina) ? (settings.map.tiles.maxZoom + 2) : settings.map.tiles.maxZoom;
  }

  private getMapOptions(topoMap: TopoMap) {
    const norwegianMixedMap = {
      name: TopoMap.statensKartverk,
      url: settings.map.tiles.statensKartverkMapUrl,
      bounds: <any>settings.map.tiles.supportTilesBounds,
      notInsideBounds: null,
    };
    const openTopoMap = {
      name: TopoMap.openTopo,
      url: settings.map.tiles.openTopoMapUrl,
      bounds: null,
      notInsideBounds: null,
    };
    const arcGisOnlineMap = {
      name: TopoMap.arcGisOnline,
      url: settings.map.tiles.arcGisOnlineTopoMapUrl,
      bounds: null,
      notInsideBounds: null,
    };
    switch (topoMap) {
      case TopoMap.statensKartverk:
        return [
          {
            name: TopoMap.statensKartverk,
            url: settings.map.tiles.statensKartverkMapUrl,
            bounds: null,
            notInsideBounds: null,
          }
        ];
      case TopoMap.openTopo:
        return [openTopoMap];
      case TopoMap.arcGisOnline:
        return [arcGisOnlineMap];
      case TopoMap.mixOpenTopo:
        return [{ ...openTopoMap, notInsideBounds: NORWEGIAN_BOUNDS }, norwegianMixedMap];
      case TopoMap.mixArcGisOnline:
        return [{ ...arcGisOnlineMap, notInsideBounds: NORWEGIAN_BOUNDS }, norwegianMixedMap];
    }
  }

  redrawMap() {
    let counter = 3;
    timer(500, 50).pipe(
      takeWhile(() => counter > 0),
      tap(() => counter--)).subscribe(() => {
        if (this.map) {
          this.loggingService.debug('Invalidate size', DEBUG_TAG);
          this.map.invalidateSize();
          // window.dispatchEvent(new Event('resize'));
        } else {
          this.loggingService.debug('No map to invalidate', DEBUG_TAG);
        }
      });
  }

  ngAfterViewInit(): void {
    this.redrawMap();
  }

  startGeoPositionUpdates() {
    if (this.showUserLocation && !this.isAskingForPermissions) {
      this.isGeoLocationActive = true;
      this.loggingService.debug('Start watching location changes', DEBUG_TAG);
      if (this.geoLoactionSubscription === undefined || this.geoLoactionSubscription.closed) {
        this.isAskingForPermissions = true;
        // TODO: Start with low accuracy and when that is success, start watching high accuracy?
        this.geoLoactionSubscription = this.geolocation.watchPosition(settings.gps.lowAccuracyPositionOptions)
          .subscribe(
            (data) => this.onPositionUpdate(data),
            (error) => this.onPositionError(error)
          );
      } else {
        this.loggingService.debug('Geolocation service allready running', DEBUG_TAG);
      }
      this.startWatchingHeading();
    }
  }

  private startWatchingHeading() {
    // TODO: Implement compass needs calibration alert?
    //   window.addEventListener('compassneedscalibration', function(event) {
    //     // ask user to wave device in a figure-eight motion
    //     event.preventDefault();
    // }, true);

    this.requestDeviceOrientationPermission().then((granted) => {
      if (granted) {
        if ('ondeviceorientationabsolute' in <any>window) {
          window.addEventListener('deviceorientationabsolute', this.setHeadingFunc, false);
        } else if ('ondeviceorientation' in <any>window) {
          window.addEventListener('deviceorientation', this.setHeadingFunc, false);
        }
      }
    });
  }

  private requestDeviceOrientationPermission(): Promise<boolean> {
    // TODO: iOS 13 ask for permission every time, and from localhost.
    // this needs to be better supported before turning on
    // or use another native plugin than depricated
    // https://github.com/apache/cordova-plugin-device-orientation
    // https://medium.com/flawless-app-stories/how-to-request-device-motion-and-orientation-permission-in-ios-13-74fc9d6cd140

    // const doe = <any>DeviceOrientationEvent;
    // if (typeof doe.requestPermission === 'function') {
    //   // iOS 13+
    //   const response = await doe.requestPermission();
    //   return response === 'granted';
    // } else {
    //   // non iOS 13+
    return Promise.resolve(true);
    // }
  }

  startHighAccuracyPositionUpdates() {
    this.loggingService.debug('Start high accuracy position updates', DEBUG_TAG);
    this.gpsHighAccuracyEnabled = true;
    this.geoLoactionSubscription = this.geolocation.watchPosition(settings.gps.highAccuracyPositionOptions)
      .subscribe(
        (data) => this.onPositionUpdate(data),
        (error) => this.onPositionError(error)
      );
  }

  stopGeoPositionUpdates() {
    this.isGeoLocationActive = false;
    window.removeEventListener('deviceorientation', this.setHeadingFunc);
    window.removeEventListener('deviceorientationabsolute', this.setHeadingFunc);
    if (!this.isAskingForPermissions) {
      this.loggingService.debug('Stop watching location changes', DEBUG_TAG);
      if (this.geoLoactionSubscription !== undefined && !this.geoLoactionSubscription.closed) {
        this.geoLoactionSubscription.unsubscribe();
      }
    }
  }

  private setHeading(event: DeviceOrientationEvent) {
    if (this.userMarker) {
      const appleHeading = (<any>event).webkitCompassHeading;
      const heading = appleHeading !== undefined ? appleHeading :
        (event.alpha !== undefined && event.absolute ? (360 - event.alpha) : undefined);
      if (heading !== undefined && heading >= 0 && heading <= 360) {
        this.userMarker.setHeading(heading);
      }
    }
  }

  private onPositionUpdate(data: Geoposition) {
    if (data.coords) {
      if (!this.gpsHighAccuracyEnabled) {
        this.startHighAccuracyPositionUpdates();
      }
      this.isAskingForPermissions = false;
      this.positionChange.emit(data);
      this.zone.runOutsideAngular(() => {
        if (this.map) {
          const latLng = L.latLng({ lat: data.coords.latitude, lng: data.coords.longitude });
          if (!this.userMarker) {
            this.userMarker = new UserMarker(this.map, data);
          } else {
            this.userMarker.updatePosition(data);
          }
          if (this.followMode && !this.isDoingMoveAction) {
            this.flyToMaxZoom(latLng, !this.firstPositionUpdate);
            this.firstPositionUpdate = false;
          }
        }
      });
    } else {
      const error = data as unknown as PositionError;
      if (error && error.PERMISSION_DENIED === 1) {
        this.loggingService.debug('Permission denied for location service', DEBUG_TAG);
      } else {
        this.isAskingForPermissions = false;
      }
    }
  }

  private flyToMaxZoom(latLng: L.LatLng, usePan = false) {
    this.flyTo(latLng, Math.max(settings.map.flyToOnGpsZoom, this.map.getZoom()), usePan);
  }

  private flyTo(latLng: L.LatLng, zoom: number, usePan = false) {
    this.isDoingMoveAction = true;
    // if (usePan) {
    //   this.map.panTo(latLng);
    // } else {
    //   this.map.flyTo(latLng, zoom);
    // }
    // Note: Poor performance on flyTo effect, so using setView without animate instead.
    this.map.setView(latLng, zoom, { animate: false });
    this.isDoingMoveAction = false;
  }

  private onPositionError(error: any) {
    this.isAskingForPermissions = false;
    this.loggingService.error(error, DEBUG_TAG, 'Got error from GeoLoaction watchPosition');
  }

  private async checkPermissionsAndStartGeoPositionUpdates() {
    // https://www.devhybrid.com/ionic-4-requesting-user-permissions/
    this.isAskingForPermissions = false; // reset
    try {
      const authorized = await this.diagnostic.isLocationAuthorized();
      this.loggingService.debug('Location is ' + (authorized ? 'authorized' : 'unauthorized'), DEBUG_TAG);
      if (!authorized) {
        if (this.platform.is('ios')) {
          await this.showPermissionDeniedError();
          return;
        }
        // location is not authorized, request new. This only works on Android
        const status = await this.diagnostic.requestLocationAuthorization();
        this.loggingService.debug(`Request location status`, DEBUG_TAG, status);
        if (status === this.diagnostic.permissionStatus.DENIED_ONCE ||
          status === this.diagnostic.permissionStatus.DENIED_ALWAYS) {
          await this.showPermissionDeniedError();
          return;
        }
      }
      this.startGeoPositionUpdates();
    } catch (err) {
      this.loggingService.error(err, DEBUG_TAG, 'Error asking for location permissions');
    }
  }

  private async showPermissionDeniedError() {
    const translations = await this.translateService.get([
      'ALERT.OK',
      'PERMISSION.LOCATION_DENIED_HEADER',
      'PERMISSION.LOCATION_DENIED_MESSAGE']).toPromise();
    const alert = await this.alertController.create({
      header: translations['PERMISSION.LOCATION_DENIED_HEADER'],
      message: translations['PERMISSION.LOCATION_DENIED_MESSAGE'],
      buttons: [translations['ALERT.OK']]
    });
    await alert.present();
  }
}
