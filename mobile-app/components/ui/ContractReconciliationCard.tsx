import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatINR, type ContractReconciliation, type ReconLineKey } from '@poultryos/shared';
import { Card } from './Card';
import { colors, spacing, typography } from '../../theme/tokens';

export interface ContractReconciliationCardProps {
  reconciliation: ContractReconciliation;
  testID?: string;
}

/**
 * Read-only "your data vs integrator statement" comparison. Leads with the
 * bottom-line gap, then a per-figure table with the rupee impact of each gap.
 * All math comes pre-computed from the shared engine (no logic here).
 */
export function ContractReconciliationCard({
  reconciliation: r,
  testID,
}: ContractReconciliationCardProps) {
  const { t } = useTranslation();
  const fmtNum = (v: number | null) =>
    v == null ? '—' : v.toLocaleString('en-IN', { maximumFractionDigits: 3 });

  const gap = r.expectedVsStatedGap;

  return (
    <Card testID={testID}>
      <Text style={styles.title}>{t('contract.reconcile.title')}</Text>
      <Text style={styles.subtitle}>{t('contract.reconcile.subtitle')}</Text>

      {gap != null && Math.abs(gap) >= 1 ? (
        <View style={[styles.banner, gap > 0 ? styles.bannerWarn : styles.bannerOk]}>
          <Text style={[styles.bannerText, gap > 0 ? styles.bannerTextWarn : styles.bannerTextOk]}>
            {gap > 0
              ? t('contract.reconcile.owed', { amount: formatINR(gap, { decimals: 0 }) })
              : t('contract.reconcile.statement_ok', {
                  amount: formatINR(r.yourSettlement.total, { decimals: 0 }),
                })}
          </Text>
        </View>
      ) : null}

      {/* Header row */}
      <View style={[styles.row, styles.headerRow]}>
        <Text style={[styles.cell, styles.cellLabel, styles.headerCell]} />
        <Text style={[styles.cell, styles.cellNum, styles.headerCell]}>{t('contract.reconcile.your')}</Text>
        <Text style={[styles.cell, styles.cellNum, styles.headerCell]}>{t('contract.reconcile.integrator')}</Text>
        <Text style={[styles.cell, styles.cellNum, styles.headerCell]}>{t('contract.reconcile.impact')}</Text>
      </View>

      {r.lines.map((l) => {
        const material = Math.abs(l.rupeeImpact) >= 1 && l.delta != null;
        return (
          <View key={l.key} style={styles.row}>
            <Text style={[styles.cell, styles.cellLabel]}>
              {t(`contract.reconcile.line.${l.key as ReconLineKey}`)}
            </Text>
            <Text style={[styles.cell, styles.cellNum]}>{fmtNum(l.yourValue)}</Text>
            <Text style={[styles.cell, styles.cellNum]}>{fmtNum(l.integratorValue)}</Text>
            <Text
              style={[
                styles.cell,
                styles.cellNum,
                material ? (l.rupeeImpact > 0 ? styles.impactPos : styles.impactNeg) : styles.impactNone,
              ]}
            >
              {material
                ? `${l.rupeeImpact >= 0 ? '+' : '−'}${formatINR(Math.abs(l.rupeeImpact), { decimals: 0 })}`
                : '—'}
            </Text>
          </View>
        );
      })}

      {r.statementArithmeticGap != null && Math.abs(r.statementArithmeticGap) >= 1 ? (
        <Text style={styles.footnote}>
          {t('contract.reconcile.arithmetic_gap', {
            computed: formatINR(r.integratorComputedSettlement.total, { decimals: 0 }),
            stated: formatINR(r.integratorStatedAmount ?? 0, { decimals: 0 }),
          })}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.bodyMdStrong, color: colors.ink },
  subtitle: { ...typography.bodySm, color: colors.body, marginTop: spacing.xxs, marginBottom: spacing.sm },
  banner: { borderRadius: 8, padding: spacing.md, marginBottom: spacing.sm },
  bannerWarn: { backgroundColor: colors.warningSoft },
  bannerOk: { backgroundColor: colors.successSoft },
  bannerText: { ...typography.bodySmStrong },
  bannerTextWarn: { color: colors.warningInk },
  bannerTextOk: { color: colors.successInk },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  headerRow: { borderBottomWidth: 1, borderBottomColor: colors.mute },
  cell: { ...typography.bodySm, color: colors.ink },
  cellLabel: { flex: 1.4, color: colors.body },
  cellNum: { flex: 1, textAlign: 'right' },
  headerCell: { ...typography.captionUppercase, color: colors.bodySoft },
  impactPos: { color: colors.successInk, fontWeight: '600' },
  impactNeg: { color: colors.danger, fontWeight: '600' },
  impactNone: { color: colors.bodySoft },
  footnote: { ...typography.caption, color: colors.bodySoft, marginTop: spacing.sm },
});
