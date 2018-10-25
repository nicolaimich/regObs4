import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import * as L from 'leaflet';
import { IRegistration } from '../../models/registration.model';
import { RegistrationService } from '../../services/registration.service';
import { Geoposition } from '@ionic-native/geolocation/ngx';
import { MapService } from '../../../map/services/map/map.service';
import { take, tap, switchMap, debounceTime, map } from 'rxjs/operators';
import { NavController, Events } from '@ionic/angular';
import { settings } from '../../../../../settings';
import { HelperService } from '../../../../core/services/helpers/helper.service';
import { MapSearchService } from '../../../map/services/map-search/map-search.service';
import { Observable, Subscription } from 'rxjs';
import { IMapView } from '../../../map/services/map/map-view.interface';
import { LocationName } from '../../../map/services/map-search/location-name.model';
import { LocationService } from '../../../../core/services/location/location.service';
import { ObsLocationsResponseDtoV2 } from '../../../regobs-api/models';

@Component({
  selector: 'app-obs-location',
  templateUrl: './obs-location.page.html',
  styleUrls: ['./obs-location.page.scss'],
})
export class ObsLocationPage implements OnInit, OnDestroy {
  private map: L.Map;
  registration: IRegistration;
  locationMarker: L.Marker;
  private followMode = true;
  private userposition: Geoposition;
  private pathLine: L.Polyline;
  showDetails = false;
  distanceToObservationText = '';
  elevation$: Observable<number>;
  location$: Observable<LocationName>;
  isLoading = false;
  private mapViewObservableSubscription: Subscription;
  private locationsSubscription: Subscription;
  private locationGroup = L.markerClusterGroup();
  selectedLocation: ObsLocationsResponseDtoV2;

  constructor(
    private registrationService: RegistrationService,
    private mapService: MapService,
    private navController: NavController,
    private events: Events,
    private helperService: HelperService,
    private cdr: ChangeDetectorRef,
    private mapSearchService: MapSearchService,
    private locationService: LocationService,
  ) { }

  async ngOnInit() {
    const defaultIcon = L.icon({
      iconUrl: 'leaflet/marker-icon.png',
      shadowUrl: 'leaflet/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      tooltipAnchor: [16, -28],
      shadowSize: [41, 41],
    });
    L.Marker.prototype.options.icon = defaultIcon;

    this.registration = await this.registrationService.getCurrentRegistration();
    if (this.hasLocation(this.registration)) {
      this.followMode = false;
      this.locationMarker = L.marker(
        {
          lat: this.registration.ObsLocation.Latitude,
          lng: this.registration.ObsLocation.Longitude
        }
      );
      if (this.registration.ObsLocation.ObsLocationID) {
        this.selectedLocation = {
          Name: this.registration.ObsLocation.LocationName,
          Id: this.registration.ObsLocation.ObsLocationID,
        };
      }
    } else {
      const lastView = await this.mapService.mapViewObservable$.pipe(take(1)).toPromise();
      if (lastView) {
        this.locationMarker = L.marker(lastView.center);
      } else {
        this.locationMarker = L.marker(L.latLng(59.1, 10.3)); // TODO: Try to set to current user position?
      }
    }

    const mapViewObservable = this.mapService.mapViewObservable$.pipe(tap((val) => {
      this.isLoading = true;
      this.cdr.detectChanges();
    }));
    this.mapViewObservableSubscription = mapViewObservable.pipe(debounceTime(5000)).
      subscribe((mapView) => {
        const range = Math.round(mapView.bounds.getNorthWest().distanceTo(mapView.bounds.getSouthEast()) / 2);
        this.locationService.updateLocationWithinRadius(mapView.center.lat, mapView.center.lng, range);
      });
    const mapViewInfoObservable = mapViewObservable
      .pipe(debounceTime(200), switchMap((mapView: IMapView) =>
        this.mapSearchService.getViewInfo(mapView.center, true)),
        tap(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }));
    this.location$ = mapViewInfoObservable.pipe(map((val) => val.location), tap(() => this.cdr.detectChanges()));
    this.elevation$ = mapViewInfoObservable.pipe(map((val) => val.elevation), tap(() => this.cdr.detectChanges()));

    this.locationsSubscription = this.locationService.getLocationsInViewAsObservable()
      .subscribe((locations) => {
        this.locationGroup.clearLayers();
        for (const location of locations) {
          const marker = L.marker(L.latLng(location.LatLngObject.Latitude, location.LatLngObject.Longitude))
            .addTo(this.locationGroup);
          marker.on('click', () => this.setToPrevouslyUsedLocation(location));
        }
      });
  }

  ngOnDestroy(): void {
    this.mapViewObservableSubscription.unsubscribe();
    this.locationsSubscription.unsubscribe();
  }

  onMapReady(m: L.Map) {
    this.map = m;
    this.locationMarker.setZIndexOffset(100).addTo(this.map);
    this.locationGroup.addTo(this.map);
    this.map.setView(this.locationMarker.getLatLng(), 15); // TODO: Set initial view in component
    this.map.on('drag', () => this.moveLocationMarkerToCenter());
    this.events.subscribe(settings.events.centerMapToUser, () => this.centerMapToUser());
  }

  private setToPrevouslyUsedLocation(location: ObsLocationsResponseDtoV2) {
    this.followMode = false;
    this.selectedLocation = location;
    this.locationMarker.setLatLng(L.latLng(location.LatLngObject.Latitude,
      location.LatLngObject.Longitude));
    this.map.panTo(this.locationMarker.getLatLng());
    this.updatePathAndDistance();
  }

  private moveLocationMarkerToCenter() {
    this.followMode = false;
    this.selectedLocation = null;
    const center = this.map.getCenter();
    this.locationMarker.setLatLng(center);
    this.updatePathAndDistance();
  }

  centerMapToUser() {
    this.followMode = true;
    this.selectedLocation = null;
    if (this.userposition) {
      this.positionChange(this.userposition);
    }
  }

  private hasLocation(reg: IRegistration) {
    return reg
      && reg.ObsLocation
      && reg.ObsLocation.Latitude
      && reg.ObsLocation.Longitude;
  }

  positionChange(position: Geoposition) {
    if (position.coords) {
      this.userposition = position;
      if (this.followMode) {
        this.locationMarker.setLatLng({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      }
      this.updatePathAndDistance();
    }
  }

  updatePathAndDistance() {
    if (this.userposition) {
      const locationMarkerLatLng = this.locationMarker.getLatLng();
      const userPositionLatLng = L.latLng(this.userposition.coords.latitude, this.userposition.coords.longitude);
      const path = [locationMarkerLatLng, userPositionLatLng];
      if (!this.pathLine) {
        this.pathLine = L.polyline(path, { color: 'black', weight: 6, opacity: .9, dashArray: '1,12' }).addTo(this.map);
      } else {
        this.pathLine.setLatLngs(path);
      }
      this.distanceToObservationText = this.helperService.getDistanceText(locationMarkerLatLng.distanceTo(userPositionLatLng));
      this.cdr.detectChanges();
    }
  }

  toggleDetails() {
    this.showDetails = !this.showDetails;
  }

  getLocationName(location: LocationName) {
    if (location) {
      return location.adminName !== location.name ? `${location.name} / ${location.adminName}` : location.name;
    }
    return '';
  }

  async confirmLocation() {
    const latLng = this.locationMarker.getLatLng();
    if (!this.registration) {
      this.registration = await this.registrationService.createNewRegistration();
    }
    this.registration.ObsLocation = {
      Latitude: latLng.lat,
      Longitude: latLng.lng
    };
    if (this.selectedLocation) {
      this.registration.ObsLocation.LocationName = this.selectedLocation.Name;
      this.registration.ObsLocationID = this.selectedLocation.Id;
    } else {
      const locationName = await this.location$.pipe(take(1)).toPromise();
      this.registration.ObsLocation.LocationName = this.getLocationName(locationName);
    }
    if (this.followMode && this.userposition) {
      this.registration.ObsLocation.Uncertainty = this.userposition.coords.accuracy;
    }
    // this.registration.ObsLocation.UTMSourceTID =
    // TODO: Set source
    await this.registrationService.saveRegistration(this.registration);
    if (this.registration.DtObsTime) {
      this.navController.navigateForward('registration');
    } else {
      this.navController.navigateForward('registration/set-time');
    }
  }

}