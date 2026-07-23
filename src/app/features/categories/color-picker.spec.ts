import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ColorPickerComponent } from './color-picker';

function createComponent(color = '#ff0000') {
  const fixture = TestBed.createComponent(ColorPickerComponent);
  fixture.componentRef.setInput('color', color);
  return fixture;
}

describe('ColorPickerComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  describe('onStateChange', () => {
    it('sets draft to the current color input, uppercased, when opening', () => {
      const fixture = createComponent('#ff0000');
      const component = fixture.componentInstance;

      component['onStateChange']('open');

      expect(component['draft']()).toBe('#FF0000');
    });

    it('does not touch draft when closing', () => {
      const fixture = createComponent('#ff0000');
      const component = fixture.componentInstance;

      component['onStateChange']('open');
      component['draft'].set('#123ABC');
      component['onStateChange']('closed');

      expect(component['draft']()).toBe('#123ABC');
    });
  });

  describe('isActive', () => {
    it('is true when the swatch matches the color input case-insensitively', () => {
      const fixture = createComponent('#ff0000');
      const component = fixture.componentInstance;

      expect(component['isActive']('#FF0000')).toBe(true);
    });

    it('is false when the swatch differs from the color input', () => {
      const fixture = createComponent('#ff0000');
      const component = fixture.componentInstance;

      expect(component['isActive']('#00FF00')).toBe(false);
    });
  });

  describe('isUsed', () => {
    it('is true when the swatch (uppercase) is present in usedColors, regardless of case', () => {
      const fixture = createComponent('#ff0000');
      fixture.componentRef.setInput('usedColors', ['#00ff00', '#0000FF']);
      const component = fixture.componentInstance;

      expect(component['isUsed']('#00FF00')).toBe(true);
      expect(component['isUsed']('#0000FF')).toBe(true);
    });

    it('is false when the swatch is not present in usedColors', () => {
      const fixture = createComponent('#ff0000');
      fixture.componentRef.setInput('usedColors', ['#00ff00']);
      const component = fixture.componentInstance;

      expect(component['isUsed']('#CF3030')).toBe(false);
    });

    it('is false when usedColors is empty (default)', () => {
      const fixture = createComponent('#ff0000');
      const component = fixture.componentInstance;

      expect(component['isUsed']('#FF0000')).toBe(false);
    });
  });

  describe('choose', () => {
    it('sets draft, emits colorChange with the swatch, and closes the popover', () => {
      const fixture = createComponent('#ff0000');
      const component = fixture.componentInstance;
      const emitted: string[] = [];
      component.colorChange.subscribe((v) => emitted.push(v));

      component['state'].set('open');
      component['choose']('#30CF30');

      expect(component['draft']()).toBe('#30CF30');
      expect(emitted).toEqual(['#30CF30']);
      expect(component['state']()).toBe('closed');
    });
  });

  describe('onDraftChange', () => {
    it('sets draft to the raw value and emits the normalized/uppercased hex for a valid 6-digit hex', () => {
      const fixture = createComponent('#ff0000');
      const component = fixture.componentInstance;
      const emitted: string[] = [];
      component.colorChange.subscribe((v) => emitted.push(v));

      component['onDraftChange']('abc123');

      expect(component['draft']()).toBe('abc123');
      expect(emitted).toEqual(['#ABC123']);
    });

    it('expands a 3-digit hex shorthand and emits the expanded/uppercased hex', () => {
      const fixture = createComponent('#ff0000');
      const component = fixture.componentInstance;
      const emitted: string[] = [];
      component.colorChange.subscribe((v) => emitted.push(v));

      component['onDraftChange']('f0a');

      expect(component['draft']()).toBe('f0a');
      expect(emitted).toEqual(['#FF00AA']);
    });

    it('does not emit for invalid input, but still records the raw draft', () => {
      const fixture = createComponent('#ff0000');
      const component = fixture.componentInstance;
      const emitted: string[] = [];
      component.colorChange.subscribe((v) => emitted.push(v));

      component['onDraftChange']('not-a-color');

      expect(component['draft']()).toBe('not-a-color');
      expect(emitted).toEqual([]);
    });

    it('does not emit for a value with the wrong length', () => {
      const fixture = createComponent('#ff0000');
      const component = fixture.componentInstance;
      const emitted: string[] = [];
      component.colorChange.subscribe((v) => emitted.push(v));

      component['onDraftChange']('#ab');

      expect(component['draft']()).toBe('#ab');
      expect(emitted).toEqual([]);
    });
  });

  describe('applyDraft', () => {
    it('is a no-op when draft does not normalize to a valid hex', () => {
      const fixture = createComponent('#ff0000');
      const component = fixture.componentInstance;
      const emitted: string[] = [];
      component.colorChange.subscribe((v) => emitted.push(v));

      component['state'].set('open');
      component['draft'].set('not-a-color');
      component['applyDraft']();

      expect(emitted).toEqual([]);
      expect(component['state']()).toBe('open');
      expect(component['draft']()).toBe('not-a-color');
    });

    it('normalizes draft, emits colorChange, and closes the popover when valid', () => {
      const fixture = createComponent('#ff0000');
      const component = fixture.componentInstance;
      const emitted: string[] = [];
      component.colorChange.subscribe((v) => emitted.push(v));

      component['state'].set('open');
      component['draft'].set('f0a');
      component['applyDraft']();

      expect(emitted).toEqual(['#FF00AA']);
      expect(component['draft']()).toBe('#FF00AA');
      expect(component['state']()).toBe('closed');
    });
  });

  describe('draftPreview', () => {
    it('is null when draft is invalid text', () => {
      const fixture = createComponent('#ff0000');
      const component = fixture.componentInstance;

      component['draft'].set('not-a-color');

      expect(component['draftPreview']()).toBeNull();
    });

    it('is the normalized hex when draft is valid text', () => {
      const fixture = createComponent('#ff0000');
      const component = fixture.componentInstance;

      component['draft'].set('f0a');

      expect(component['draftPreview']()).toBe('#FF00AA');
    });

    it('reflects a 6-digit hex without the leading # the same as with it', () => {
      const fixture = createComponent('#ff0000');
      const component = fixture.componentInstance;

      component['draft'].set('abc123');

      expect(component['draftPreview']()).toBe('#ABC123');
    });
  });
});
