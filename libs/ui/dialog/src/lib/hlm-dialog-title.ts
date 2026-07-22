import { Directive } from '@angular/core';
import { BrnDialogTitle } from '@spartan-ng/brain/dialog';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
	selector: '[hlmDialogTitle]',
	hostDirectives: [BrnDialogTitle],
	host: { 'data-slot': 'dialog-title' },
})
export class HlmDialogTitle {
	constructor() {
		// Reserve room for hlm-dialog-content's larger mobile-only close button (end-3/top-3, size-9)
		// so a long Italian title never runs under it; no padding needed at md: where it's stock icon-sm.
		classes(() => 'text-base leading-none font-medium pr-12 md:pr-0');
	}
}
