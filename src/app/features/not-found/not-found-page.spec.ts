import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { NotFoundPage } from './not-found-page';

// NotFoundPage has no injected dependencies, no signals, no methods — it's a static
// template wrapper (icon + link back). A smoke test confirming it instantiates is all
// there is to assert here. provideRouter is only needed because the template's
// routerLink directive resolves ActivatedRoute at construction time.
describe('NotFoundPage', () => {
  it('creates the component instance', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const component = TestBed.createComponent(NotFoundPage).componentInstance;
    expect(component).toBeTruthy();
  });
});
