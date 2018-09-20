import { StatusBar } from '@ionic-native/status-bar/ngx';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';
import { RouteReuseStrategy, Routes } from '@angular/router';
import { IonicRouteStrategy } from '@ionic/angular';
import { Geolocation } from '@ionic-native/geolocation/ngx';
import { Deeplinks } from '@ionic-native/deeplinks/ngx';
import { BackgroundFetch } from '@ionic-native/background-fetch/ngx';
import { BackgroundGeolocationNativeService } from './core/services/background-geolocation/background-geolocation-native.service';
import { BackgroundGeolocation } from '@ionic-native/background-geolocation/ngx';
import { BackgroundGeolocationWebService } from './core/services/background-geolocation/background-geolocation-web.service';
import { BackgroundGeolocationService } from './core/services/background-geolocation/background-geolocation.service';
import { File } from '@ionic-native/file/ngx';
import { AndroidPermissions } from '@ionic-native/android-permissions/ngx';
import { BackgroundDownloadService } from './core/services/background-download/background-download.service';
import { BackgroundDownloadWebService } from './core/services/background-download/background-download-web.service';
import { BackgroundDownloadNativeService } from './core/services/background-download/background-download-native.service';

export class AppProviders {
    public static getProviders() {
        return [
            StatusBar,
            SplashScreen,
            { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
            Geolocation,
            Deeplinks,
            BackgroundFetch,
            BackgroundGeolocation,
            File,
            AndroidPermissions,
            ...(window.hasOwnProperty('cordova') ? this.getNativeProviders() : this.getWebProviders()),
        ];
    }

    private static getWebProviders() {
        return [
            { provide: BackgroundGeolocationService, useClass: BackgroundGeolocationWebService },
            { provide: BackgroundDownloadService, useClass: BackgroundDownloadWebService },
        ];
    }

    private static getNativeProviders() {
        return [
            { provide: BackgroundGeolocationService, useClass: BackgroundGeolocationNativeService },
            { provide: BackgroundDownloadService, useClass: BackgroundDownloadNativeService },
        ];
    }

}
