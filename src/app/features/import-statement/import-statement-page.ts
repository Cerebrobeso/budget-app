import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmButtonGroupImports } from '@spartan-ng/helm/button-group';
import { HlmCard } from '@spartan-ng/helm/card';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideFileText, lucideUpload } from '@ng-icons/lucide';
import { Transaction } from '../../core/models';
import { CategoryStore, TransactionStore } from '../../core/stores';
import { eur } from '../../core/format';
import { eurSigned } from '../../core/format';
import { validateStatementFile, decodeTextFile } from './file-validation';
import { parseCsv } from './csv-parser';
import { parsePdf } from './pdf-parser';
import { parseXls } from './xls-parser';
import { guessDateFormat, guessFieldMapping, mapRows } from './column-mapping';
import { BankProfile, matchBankProfile } from './bank-profiles';
import { checkBalance, extractBalances } from './balance-check';
import { markDuplicates } from './dedup';
import {
  AmountMappingMode,
  DATE_FORMAT_OPTIONS,
  DateFormatOption,
  FieldMapping,
  ParsedRows,
  ParsedTransactionRow,
} from './import-types';

type ImportStep = 'upload' | 'mapping' | 'preview';

const DATE_FORMAT_LABELS: Record<DateFormatOption, string> = {
  'dd/MM/yyyy': 'gg/mm/aaaa',
  'dd.MM.yyyy': 'gg.mm.aaaa',
  'dd-MM-yyyy': 'gg-mm-aaaa',
  'dd/MM/yy': 'gg/mm/aa',
  'yyyy-MM-dd': 'aaaa-mm-gg',
};

@Component({
  selector: 'app-import-statement-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    HlmButton,
    ...HlmButtonGroupImports,
    HlmCard,
    HlmLabel,
    ...HlmSelectImports,
    ...HlmTableImports,
    ...HlmBadgeImports,
    ...HlmCheckboxImports,
    ...HlmSpinnerImports,
    ...HlmTooltipImports,
    NgIcon,
    DatePipe,
  ],
  providers: [provideIcons({ lucideChevronLeft, lucideFileText, lucideUpload })],
  templateUrl: './import-statement-page.html',
  styleUrl: './import-statement-page.css',
})
export class ImportStatementPage {
  private readonly txStore = inject(TransactionStore);
  protected readonly catStore = inject(CategoryStore);
  private readonly router = inject(Router);

  readonly step = signal<ImportStep>('upload');
  readonly file = signal<File | null>(null);
  readonly fileError = signal<string>('');
  readonly parsing = signal(false);
  readonly parsedRows = signal<ParsedRows | null>(null);

  readonly dateColumn = signal<number | null>(null);
  readonly descriptionColumn = signal<number | null>(null);
  readonly dateFormat = signal<DateFormatOption>('dd/MM/yyyy');
  readonly amountMode = signal<AmountMappingMode>('signed');
  readonly amountColumn = signal<number | null>(null);
  readonly debitColumn = signal<number | null>(null);
  readonly creditColumn = signal<number | null>(null);
  readonly mappingValid = computed(() => {
    if (this.dateColumn() === null || this.descriptionColumn() === null) return false;
    return this.amountMode() === 'signed'
      ? this.amountColumn() !== null
      : this.debitColumn() !== null && this.creditColumn() !== null;
  });

  readonly columnLabels = computed(() => this.parsedRows()?.columnLabels ?? []);
  readonly sampleRows = computed(() => this.parsedRows()?.rows.slice(0, 5) ?? []);

  readonly bankProfile = signal<BankProfile | null>(null);
  readonly previewRows = signal<ParsedTransactionRow[]>([]);
  readonly balanceWarning = signal<string>('');
  protected readonly dateFormatOptions = DATE_FORMAT_OPTIONS;
  readonly selectedCount = computed(() => this.previewRows().filter((r) => r.selected).length);
  readonly duplicateCount = computed(
    () => this.previewRows().filter((r) => r.isDuplicateOfExisting || r.isDuplicateInBatch).length,
  );
  readonly importing = signal(false);

  protected readonly fmt = eur;

  protected readonly dateColumnValue = computed<string | null>(() => this.toColumnValue(this.dateColumn()));
  protected readonly amountColumnValue = computed<string | null>(() => this.toColumnValue(this.amountColumn()));
  protected readonly debitColumnValue = computed<string | null>(() => this.toColumnValue(this.debitColumn()));
  protected readonly creditColumnValue = computed<string | null>(() => this.toColumnValue(this.creditColumn()));
  protected readonly descriptionColumnValue = computed<string | null>(() => this.toColumnValue(this.descriptionColumn()));

  private toColumnValue(index: number | null): string | null {
    return index !== null ? String(index) : null;
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const selected = input.files?.[0];
    input.value = '';
    if (selected) await this.handleFile(selected);
  }

  private async handleFile(file: File): Promise<void> {
    this.file.set(file);
    this.fileError.set('');
    this.parsing.set(true);
    try {
      const validation = await validateStatementFile(file);
      if (!validation.ok) {
        this.fileError.set(validation.error ?? 'File non valido.');
        return;
      }

      const parsed =
        validation.kind === 'csv'
          ? parseCsv(decodeTextFile(await file.arrayBuffer()))
          : validation.kind === 'xls'
            ? await parseXls(file)
            : await parsePdf(file);

      this.parsedRows.set(parsed);
      const profile = parsed.headers !== null ? matchBankProfile(parsed.columnLabels) : null;
      this.bankProfile.set(profile);

      const guess = { ...guessFieldMapping(parsed.columnLabels, parsed.headers !== null), ...profile?.mapping };
      this.dateColumn.set(guess.dateColumn);
      this.descriptionColumn.set(guess.descriptionColumn);
      this.amountMode.set(guess.amountMode);
      this.amountColumn.set(guess.amountColumn);
      this.debitColumn.set(guess.debitColumn);
      this.creditColumn.set(guess.creditColumn);
      this.dateFormat.set(
        profile?.dateFormat ??
          guessDateFormat(guess.dateColumn !== null ? parsed.rows.map((row) => row[guess.dateColumn!] ?? '') : []),
      );
      this.step.set('mapping');
    } catch (err) {
      this.fileError.set(err instanceof Error ? err.message : 'Impossibile leggere il file.');
    } finally {
      this.parsing.set(false);
    }
  }

  protected toColumnIndex(value: unknown): number | null {
    if (typeof value !== 'string' || value === '') return null;
    const n = Number(value);
    return Number.isInteger(n) ? n : null;
  }

  onDateFormatChange(value: unknown): void {
    if (DATE_FORMAT_OPTIONS.includes(value as DateFormatOption)) {
      this.dateFormat.set(value as DateFormatOption);
    }
  }

  protected readonly columnLabelFor = (value: string): string => this.columnLabels()[Number(value)] ?? value;
  protected readonly dateFormatLabel = (value: string): string => DATE_FORMAT_LABELS[value as DateFormatOption] ?? value;

  goToPreview(): void {
    const parsed = this.parsedRows();
    if (!parsed || !this.mappingValid()) return;

    const mapping: FieldMapping = {
      dateColumn: this.dateColumn(),
      descriptionColumn: this.descriptionColumn(),
      dateFormat: this.dateFormat(),
      amountMode: this.amountMode(),
      amountColumn: this.amountColumn(),
      debitColumn: this.debitColumn(),
      creditColumn: this.creditColumn(),
    };
    const mapped = markDuplicates(mapRows(parsed, mapping), this.txStore.transactions());
    this.previewRows.set(
      mapped.map((row) => {
        if (row.type === null) return row;
        const category = this.catStore.ensureFallbackCategory(row.type);
        return { ...row, categoryId: category.id, subcategoryId: null };
      }),
    );

    // Sui movimenti interpretati, non su quelli selezionati: deselezionare un duplicato non deve
    // far scattare un falso allarme sui saldi.
    const balances = extractBalances(parsed.preamble ?? [], parsed.rows);
    const check = balances ? checkBalance(balances, mapped) : null;
    this.balanceWarning.set(
      check && !check.ok
        ? `I saldi dichiarati nel file non tornano: differenza di ${eurSigned(check.diff)}. Controlla le righe non interpretabili prima di importare.`
        : '',
    );
    this.step.set('preview');
  }

  backToMapping(): void {
    this.step.set('mapping');
  }

  backToUpload(): void {
    this.file.set(null);
    this.fileError.set('');
    this.parsedRows.set(null);
    this.dateColumn.set(null);
    this.amountMode.set('signed');
    this.amountColumn.set(null);
    this.debitColumn.set(null);
    this.creditColumn.set(null);
    this.descriptionColumn.set(null);
    this.bankProfile.set(null);
    this.previewRows.set([]);
    this.balanceWarning.set('');
    this.step.set('upload');
  }

  protected readonly isRowUsable = (row: ParsedTransactionRow): boolean =>
    row.date !== null && row.amount !== null && row.type !== null;

  toggleRowSelected(row: ParsedTransactionRow): void {
    this.previewRows.update((list) =>
      list.map((r) => (r.rowIndex === row.rowIndex ? { ...r, selected: !r.selected } : r)),
    );
  }

  categoryOptions(row: ParsedTransactionRow) {
    return row.type === 'income' ? this.catStore.incomeCategories() : this.catStore.expenseCategories();
  }

  subOptions(row: ParsedTransactionRow) {
    return row.categoryId ? this.catStore.activeSubs(row.categoryId) : [];
  }

  onRowCategoryChange(row: ParsedTransactionRow, value: unknown): void {
    if (typeof value !== 'string' || !value) return;
    const firstSub = this.catStore.activeSubs(value)[0]?.id ?? null;
    this.previewRows.update((list) =>
      list.map((r) => (r.rowIndex === row.rowIndex ? { ...r, categoryId: value, subcategoryId: firstSub } : r)),
    );
  }

  onRowSubChange(row: ParsedTransactionRow, value: unknown): void {
    const sub = typeof value === 'string' && value ? value : null;
    this.previewRows.update((list) => list.map((r) => (r.rowIndex === row.rowIndex ? { ...r, subcategoryId: sub } : r)));
  }

  protected readonly categoryLabel = (id: string): string => this.catStore.byId(id)?.name ?? id;
  protected readonly subcategoryLabelFor = (row: ParsedTransactionRow) => (id: string): string =>
    this.subOptions(row).find((s) => s.id === id)?.name ?? id;

  async confirmImport(): Promise<void> {
    const rows = this.previewRows().filter(
      (r) => r.selected && r.date !== null && r.amount !== null && r.type !== null && r.categoryId !== null,
    );
    if (rows.length === 0) return;

    this.importing.set(true);
    try {
      const payload: Omit<Transaction, 'id'>[] = rows.map((r) => ({
        date: r.date!,
        type: r.type!,
        amount: r.amount!,
        categoryId: r.categoryId!,
        subcategoryId: r.subcategoryId,
        description: r.description,
        recurringRuleId: null,
        tag: null,
      }));
      const { addedIds, failedCount } = await this.txStore.addMany(payload);
      toast.message(`${addedIds.length} movimenti importati.` + (failedCount ? ` ${failedCount} non salvati.` : ''), {
        duration: 8000,
        action: { label: 'Annulla', onClick: () => addedIds.forEach((id) => this.txStore.remove(id)) },
      });
      this.router.navigateByUrl('/movimenti');
    } finally {
      this.importing.set(false);
    }
  }
}
