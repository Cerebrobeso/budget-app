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
		// Reserve room for hlm-dialog-content's absolutely-positioned close button (end-3/top-3 on
		// mobile, md:end-2/md:top-2 md:size-8) so a long interpolated title never runs under it.
		classes(() => 'text-base leading-none font-medium pr-12 md:pr-10');
	}
}
