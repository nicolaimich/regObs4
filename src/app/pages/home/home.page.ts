import { Component, OnInit, ViewChild, OnDestroy, NgZone } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { Events, Platform } from '@ionic/angular';
import { Subscription, combineLatest, Observable } from 'rxjs';
import { ObservationService } from '../../core/services/observation/observation.service';
import { settings } from '../../../settings';
import { MapItemBarComponent } from '../../components/map-item-bar/map-item-bar.component';
import { MapItemMarker } from '../../core/helpers/leaflet/map-item-marker/map-item-marker';
import { UserSettingService } from '../../core/services/user-setting/user-setting.service';
import { MapComponent } from '../../modules/map/components/map/map.component';
import { RegistrationViewModel } from '../../modules/regobs-api/models';
import { FullscreenService } from '../../core/services/fullscreen/fullscreen.service';
import { TabService } from '../../core/services/tab/tab.service';
import { TabName } from '../../core/services/tab/tab-name.enum';
import { AppMode } from '../../core/models/app-mode.enum';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements OnInit, OnDestroy {
  @ViewChild(MapItemBarComponent) mapItemBar: MapItemBarComponent;
  @ViewChild(MapComponent) mapComponent: MapComponent;
  private map: L.Map;
  private markerLayer = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    maxClusterRadius: 60,
    iconCreateFunction: (cluster) => this.createClusterIcon(cluster),
  });
  private subscriptions: Subscription[];

  fullscreen$: Observable<boolean>;
  mapItemBarVisible = false;
  // tripLogLayer = L.layerGroup();
  selectedMarker: MapItemMarker;
  showMapCenter: boolean;
  // dataLoadIds: string[];

  constructor(
    private observationService: ObservationService,
    private tabService: TabService,
    private fullscreenService: FullscreenService,
    private userSettingService: UserSettingService,
    private zone: NgZone,
  ) {
    this.fullscreen$ = this.fullscreenService.isFullscreen$;
  }

  createClusterIcon(cluster: L.MarkerCluster) {
    const items = cluster.getAllChildMarkers().map((x: MapItemMarker) => x.item.GeoHazardTID);
    const size = (items.length < 100 ? 35 :
      (items.length < 1000 ? 50 : 70));
    return L.divIcon({
      html: '<div>' + items.length + '</div>',
      iconSize: [size, size],
      iconAnchor: [size / 2.0, size / 2.0],
      className: 'circle-marker-cluster',
    });
  }

  async ngOnInit() {
    console.log('[INFO] ionViewDidEnter home page');
    this.subscriptions = [];
    this.subscriptions.push(this.userSettingService.userSettingObservable$.subscribe((val) => {
      this.zone.run(() => {
        this.showMapCenter = val.showMapCenter;
      });
    })); // TODO: Move this to map component?

    this.subscriptions.push(this.tabService.tabsChange$.subscribe((val) => {
      if (val.tab === TabName.Home) {
        if (val.active) {
          this.mapComponent.startGeoLocationWatch();
          this.mapComponent.redrawMap();
        } else {
          this.mapComponent.stopGeoLocationWatch();
        }
      }
    }));
    this.subscriptions.push(this.mapItemBar.isVisible.subscribe((isVisible) => {
      this.zone.run(() => {
        this.mapItemBarVisible = isVisible;
      });
    }));

    // this.tripLoggerService.getTripLogAsObservable().subscribe((tripLogItems) => {
    //   this.tripLogLayer.clearLayers();
    //   const latLngs = tripLogItems.map((tripLogItem) => L.latLng({
    //     lat: tripLogItem.latitude,
    //     lng: tripLogItem.longitude
    //   }));
    //   L.polyline(latLngs, { color: 'red', weight: 3 }).addTo(this.tripLogLayer);
    // });
  }

  async onMapReady(map: L.Map) {
    console.log('[INFO] onMapReady home page');
    this.map = map;
    this.markerLayer.addTo(this.map);
    this.map.on('click', () => {
      if (this.selectedMarker) {
        this.selectedMarker.deselect();
      }
      this.selectedMarker = null;
      this.mapItemBar.hide();
    });
    // TODO: Move this to custom marker layer?
    const observationObservable =
      combineLatest(this.observationService.observations$, this.userSettingService.userSettingObservable$);
    this.subscriptions.push(observationObservable.subscribe(([regObservations, userSettings]) => {
      this.redrawObservationMarkers(userSettings.showObservations ? regObservations : []);
    }));
  }

  ionViewDidEnter() {
    console.log('[INFO] Home page ionViewDidEnter. Start GeoLocation');
    this.mapComponent.startGeoLocationWatch();
    this.mapComponent.redrawMap();
  }

  ionViewWillLeave() {
    console.log('[INFO] Home page ionViewWillLeave. Stop GeoLocation.');
    this.mapComponent.stopGeoLocationWatch();
  }

  ngOnDestroy(): void {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
  }

  private redrawObservationMarkers(regObservations: RegistrationViewModel[]) {
    this.markerLayer.clearLayers();
    for (const regObservation of regObservations) {
      const latLng = L.latLng(regObservation.ObsLocation.Latitude, regObservation.ObsLocation.Longitude);
      const marker = new MapItemMarker(regObservation, latLng, {});
      marker.on('click', (event: L.LeafletEvent) => {
        const m: MapItemMarker = event.target;
        if (this.selectedMarker) {
          this.selectedMarker.deselect();
        }

        this.selectedMarker = m;
        m.setSelected();
        this.mapItemBar.show(m.item);
      });
      marker.addTo(this.markerLayer);
    }
  }
}
