import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { RegistrationTid } from '../../models/registrationTid.enum';
import { IRegistration } from '../../models/registration.model';

@Component({
  selector: 'app-registration-content-wrapper',
  templateUrl: './registration-content-wrapper.component.html',
  styleUrls: ['./registration-content-wrapper.component.scss']
})
export class RegistrationContentWrapperComponent implements OnInit {
  @Input() registration: IRegistration;
  @Input() registrationTid: RegistrationTid;
  @Output() reset = new EventEmitter();
  @Input() isEmpty: boolean;

  constructor() { }

  ngOnInit() {
  }

  emitReset() {
    this.reset.emit();
  }

}
