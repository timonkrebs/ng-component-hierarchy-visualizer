import { Component } from '@angular/core';
import { MyDirective } from './my.directive';
import { OtherComponent } from './other.component';

@Component({
  selector: 'app-host',
  standalone: true,
  imports: [OtherComponent],
  hostDirectives: [MyDirective],
  template: ``,
})
export class HostComponent {}
