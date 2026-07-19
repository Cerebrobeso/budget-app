import { ChangeDetectionStrategy, Component, forwardRef, input } from '@angular/core';
import { BrnDialog, provideBrnDialogDefaultOptions } from '@spartan-ng/brain/dialog';
import type { ClassValue } from 'clsx';
import { HlmDialogOverlay } from './hlm-dialog-overlay';

@Component({
	selector: 'hlm-dialog',
	exportAs: 'hlmDialog',
	imports: [HlmDialogOverlay],
	providers: [
		{
			provide: BrnDialog,
			useExisting: forwardRef(() => HlmDialog),
		},
		provideBrnDialogDefaultOptions({
			// add custom options here
		}),
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<hlm-dialog-overlay [class]="overlayClass()" />
		<ng-content />
	`,
})
export class HlmDialog extends BrnDialog {
	/** Extra classes applied to this dialog's overlay, e.g. for a custom backdrop tint. */
	public readonly overlayClass = input<ClassValue>('');
}
