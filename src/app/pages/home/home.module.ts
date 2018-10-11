import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { HomePage } from './home.page';
import { TranslateModule } from '@ngx-translate/core';
import { LeafletModule } from '@asymmetrik/ngx-leaflet';
import { MapItemBarComponent } from '../../components/map-item-bar/map-item-bar.component';
import { MapControlsComponent } from '../../components/map-controls/map-controls.component';
import { MapSearchComponent } from '../../components/map-controls/map-search/map-search.component';
import { FullscreenToggleComponent } from '../../components/map-controls/fullscreen-toggle/fullscreen-toggle.component';
import { GpsCenterComponent } from '../../components/map-controls/gps-center/gps-center.component';
import { ModalSearchPageModule } from '../modal-search/modal-search.module';
import { SharedModule } from '../../modules/shared/shared.module';
import { MapCenterInfoComponent } from '../../components/map-center-info/map-center-info.component';
import { DataLoadModule } from '../../modules/data-load/data-load.module';
import { DataLoadComponent } from '../../modules/data-load/components/data-load/data-load.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild([
      {
        path: '',
        component: HomePage
      }
    ]),
    TranslateModule,
    LeafletModule,
    ModalSearchPageModule,
    SharedModule,
    DataLoadModule,
  ],
  declarations: [
    HomePage,
    MapItemBarComponent,
    MapControlsComponent,
    MapSearchComponent,
    FullscreenToggleComponent,
    GpsCenterComponent,
    MapCenterInfoComponent,
    DataLoadComponent,
  ],
})
export class HomePageModule {
}
