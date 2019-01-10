import { Component, OnInit, Input, NgZone, OnDestroy, AfterViewInit, Output, EventEmitter } from '@angular/core';
import * as L from 'leaflet';
import { UserSettingService } from '../../../../core/services/user-setting/user-setting.service';
import { Subscription } from 'rxjs';
import { OfflineMapService } from '../../../../core/services/offline-map/offline-map.service';
import { Platform } from '@ionic/angular';
import { UserSetting } from '../../../../core/models/user-settings.model';
import { settings } from '../../../../../settings';
import { Geolocation, Geoposition } from '@ionic-native/geolocation/ngx';
import { UserMarker } from '../../../../core/helpers/leaflet/user-marker/user-marker';
import { MapService } from '../../services/map/map.service';
import { take } from 'rxjs/operators';
import { FullscreenService } from '../../../../core/services/fullscreen/fullscreen.service';
import { LoggingService } from '../../../shared/services/logging/logging.service';
import { MapSearchService } from '../../services/map-search/map-search.service';
import { TopoMap } from '../../../../core/models/topo-map.enum';
import { RegObsTileLayer } from '../../core/classes/regobs-tile-layer';

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

  constructor(
    private userSettingService: UserSettingService,
    private offlineMapService: OfflineMapService,
    private mapService: MapService,
    private mapSearchService: MapSearchService,
    private platform: Platform,
    private zone: NgZone,
    private geolocation: Geolocation,
    private fullscreenService: FullscreenService,
    private loggingService: LoggingService,
  ) {
  }

  options: L.MapOptions = {
    zoom: this.zoom !== undefined ? this.zoom : settings.map.tiles.embeddedUrlMaxZoomWorld,
    maxZoom: settings.map.tiles.maxZoom,
    minZoom: 2,
    center: this.center || L.latLng(settings.map.unknownMapCenter as L.LatLngTuple),
    bounceAtZoomLimits: true,
    attributionControl: false,
    zoomControl: false,
  };

  async ngOnInit() {
    try {
      if (this.center === undefined || this.zoom === undefined) {
        const currentView = await this.mapService.mapView$.pipe(take(1)).toPromise();
        if (currentView) {
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
    this.stopGeoLocationWatch();
  }

  onLeafletMapReady(map: L.Map) {
    this.map = map;
    if (this.showScale) {
      L.control.scale({ imperial: false }).addTo(map);
    }
    this.tilesLayer.addTo(this.map);

    this.subscriptions.push(this.userSettingService.userSettingObservable$.subscribe((userSetting) => {
      this.configureTileLayers(userSetting);
    }));

    this.subscriptions.push(this.mapService.followMode$.subscribe((val) => {
      this.followMode = val;
    }));

    this.subscriptions.push(this.mapSearchService.mapSearchClick$.subscribe((item) => {
      this.disableFollowMode();
      this.zone.runOutsideAngular(() => {
        this.map.flyTo(item.latlng, settings.map.mapSearchZoomToLevel);
      });
    }));

    this.subscriptions.push(this.mapService.centerMapToUser$.subscribe(() => {
      if (this.userMarker) {
        const currentPosition = this.userMarker.getPosition();
        const latLng = L.latLng(currentPosition.coords.latitude, currentPosition.coords.longitude);
        this.zone.runOutsideAngular(() => {
          this.isDoingMoveAction = true;
          this.map.flyTo(latLng, Math.max(settings.map.flyToOnGpsZoom, this.map.getZoom()));
          this.map.once('moveend', () => {
            this.isDoingMoveAction = false;
          });
        });
      }
    }));

    if (this.showUserLocation) {
      this.startGeoLocationWatch();
      this.zone.runOutsideAngular(() => {
        this.map.on('dragstart', () => this.disableFollowMode());
        this.map.on('zoomstart', () => this.disableFollowMode());
      });
    }

    this.subscriptions.push(this.platform.pause.subscribe(() => this.stopGeoLocationWatch()));
    this.subscriptions.push(this.platform.resume.subscribe(() => {
      if (this.showUserLocation) {
        this.startGeoLocationWatch();
      }
    }));

    this.zone.runOutsideAngular(() => {
      this.map.on('moveend', () => this.updateMapView());
      this.map.on('zoomend', () => this.updateMapView());
    });

    this.subscriptions.push(this.fullscreenService.isFullscreen$.subscribe(() => {
      this.redrawMap();
    }));

    this.redrawMap();
    setTimeout(() => this.updateMapView(), 200);
    this.mapReady.emit(this.map);
  }

  private disableFollowMode() {
    if (!this.isDoingMoveAction) {
      this.mapService.followMode = false;
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

  configureTileLayers(userSetting: UserSetting) {
    this.zone.runOutsideAngular(() => {
      this.tilesLayer.clearLayers();
      const topoTilesLayer = new RegObsTileLayer(
        this.zone,
        this.offlineMapService,
        this.shouldBufferOfflineMap(userSetting),
        this.getMapOptions(userSetting.topoMap));
      topoTilesLayer.addTo(this.tilesLayer);
      for (const supportTile of settings.map.tiles.supportTiles) {
        const userSettingsForSupportTime = userSetting.supportTiles.find((x) => x.name === supportTile.name);
        if (userSetting.currentGeoHazard.indexOf(supportTile.geoHazardId) >= 0
          && (!userSettingsForSupportTime || userSettingsForSupportTime.enabled)) {
          const tile = new RegObsTileLayer(
            this.zone,
            this.offlineMapService,
            this.shouldBufferOfflineMap(userSetting),
            [{
              name: supportTile.name,
              url: supportTile.url,
              validFunc: (coords, bounds) => this.mapService.isTileInsideNorway(coords, bounds),
            }],
          );
          tile.setOpacity(userSettingsForSupportTime ? userSettingsForSupportTime.opacity : supportTile.opacity);
          tile.addTo(this.tilesLayer);
        }
      }
    });
  }

  private showNorwegianMap(coords: L.Coords, bounds: L.LatLngBounds) {
    if (coords.z < settings.map.tiles.zoomToShowBeforeNorwegianDetailsMap) {
      return false;
    }
    return this.mapService.isTileInsideNorway(coords, bounds);
  }

  private getMapOptions(topoMap: TopoMap) {
    const norwegianMixedMap = {
      name: TopoMap.statensKartverk,
      url: settings.map.tiles.statensKartverkMapUrl,
      validFunc: (coords: L.Coords, bounds: L.LatLngBounds) =>
        this.showNorwegianMap(coords, bounds),
    };
    const openTopoMap = {
      name: TopoMap.openTopo,
      url: settings.map.tiles.openTopoMapUrl,
    };
    const arcGisOnlineMap = {
      name: TopoMap.arcGisOnline,
      url: settings.map.tiles.arcGisOnlineTopoMapUrl,
    };
    switch (topoMap) {
      case TopoMap.statensKartverk:
        return [
          {
            name: TopoMap.statensKartverk,
            url: settings.map.tiles.statensKartverkMapUrl,
          }
        ];
      case TopoMap.openTopo:
        return [openTopoMap];
      case TopoMap.arcGisOnline:
        return [arcGisOnlineMap];
      case TopoMap.mixOpenTopo:
        return [norwegianMixedMap, openTopoMap];
      case TopoMap.mixArcGisOnline:
        return [norwegianMixedMap, arcGisOnlineMap];
    }
  }

  private shouldBufferOfflineMap(userSetting: UserSetting) {
    return this.platform.isAndroidOrIos() && userSetting.tilesCacheSize > 0;
  }

  redrawMap() {
    if (this.map) {
      try {
        this.map.invalidateSize();
      } catch (err) {
        this.loggingService.debug('Could not invalidate map size', DEBUG_TAG);
      }
    }
    window.dispatchEvent(new Event('resize'));
  }

  ngAfterViewInit(): void {
    this.redrawMap();
  }

  startGeoLocationWatch() {
    this.loggingService.debug('Start watching location changes', DEBUG_TAG);
    if (this.geoLoactionSubscription === undefined || this.geoLoactionSubscription.closed) {
      this.geoLoactionSubscription = this.geolocation.watchPosition(settings.gps.currentPositionOptions)
        .subscribe(
          (data) => this.onPositionUpdate(data),
          (error) => this.onPositionError(error)
        );
    } else {
      this.loggingService.debug('Geolocation service allready running', DEBUG_TAG);
    }
  }

  stopGeoLocationWatch() {
    this.loggingService.debug('Stop watching location changes', DEBUG_TAG);
    if (this.geoLoactionSubscription !== undefined && !this.geoLoactionSubscription.closed) {
      this.geoLoactionSubscription.unsubscribe();
    }
  }

  private onPositionUpdate(data: Geoposition) {
    this.positionChange.emit(data);
    this.zone.runOutsideAngular(() => {
      if (data.coords && this.map) {
        const latLng = L.latLng({ lat: data.coords.latitude, lng: data.coords.longitude });
        if (!this.userMarker) {
          this.userMarker = new UserMarker(this.map, data);
        } else {
          this.userMarker.updatePosition(data);
        }
        if (this.followMode && !this.isDoingMoveAction) {
          this.flyToMaxZoom(latLng, this.firstPositionUpdate);
          this.firstPositionUpdate = false;
        }
      }
    });
  }

  private flyToMaxZoom(latLng: L.LatLng, usePan = false) {
    this.flyTo(latLng, Math.max(settings.map.flyToOnGpsZoom, this.map.getZoom()), usePan);
  }

  private flyTo(latLng: L.LatLng, zoom: number, usePan = false) {
    this.isDoingMoveAction = true;
    if (usePan) {
      this.map.panTo(latLng);
    } else {
      this.map.flyTo(latLng, zoom);
    }
    this.map.once('moveend', () => {
      this.isDoingMoveAction = false;
    });
  }

  private onPositionError(error: any) {
    this.loggingService.error(error, DEBUG_TAG, 'Got error from GeoLoaction watchPosition');
  }
}
