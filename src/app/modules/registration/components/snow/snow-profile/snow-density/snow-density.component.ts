import { Component, OnInit, Input } from '@angular/core';
import { IsEmptyHelper } from '../../../../../../core/helpers/is-empty.helper';
import { DensityProfileDto } from '../../../../../regobs-api/models';
import { ModalController } from '@ionic/angular';
import { SnowDensityModalPage } from './snow-density-modal/snow-density-modal.page';

@Component({
  selector: 'app-snow-density',
  templateUrl: './snow-density.component.html',
  styleUrls: ['./snow-density.component.scss']
})
export class SnowDensityComponent implements OnInit {

  @Input() profiles: Array<DensityProfileDto>;

  get isEmpty() {
    return IsEmptyHelper.isEmpty(this.profiles);
  }

  constructor(private modalContoller: ModalController) { }

  ngOnInit() {
  }

  async openModal() {
    const modal = await this.modalContoller.create({
      component: SnowDensityModalPage,
      componentProps: {
        profile: (this.profiles && this.profiles.length > 0) ? { ...this.profiles[0] } : undefined,
      }
    });
    modal.present();
    const result = await modal.onDidDismiss();
    if (result.data) {
      this.profiles = [result.data];
    }
  }
}
