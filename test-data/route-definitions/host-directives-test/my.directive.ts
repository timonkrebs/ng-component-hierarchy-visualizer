import { Directive } from '@angular/core';

@Directive({
  selector: '[myDirective]',
  standalone: true,
})
export class MyDirective {
  constructor() {}
}
