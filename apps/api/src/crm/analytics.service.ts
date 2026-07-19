import { Injectable } from '@nestjs/common';
import { OpportunityStage, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConversionAnalyticsQueryDto } from './dto/analytics.dto';

/// A single row of the conversion report (overall, or scoped to one owner).
export interface ConversionMetrics {
  ownerUserId: string | null;
  organisations: number;
  contacts: number;
  opportunities: number;
  won: number;
  lost: number;
  valueWon: number;
  /// won / total closed (won + lost); 0 when nothing has closed.
  conversionRate: number;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Business-development funnel: organisations, contacts and opportunities created in
   * the range, plus won/lost counts, total won value and the conversion rate. Returned
   * both overall and broken down per owning user. Organisations/contacts/opportunities
   * are filtered on createdAt; won opportunities on wonAt.
   */
  async conversion(query: ConversionAnalyticsQueryDto = {}) {
    const createdAtFilter = this.dateFilter(query.from, query.to);
    const ownerFilter = query.ownerUserId ? { ownerUserId: query.ownerUserId } : {};

    const orgWhere: Prisma.CrmOrganisationWhereInput = { ...ownerFilter };
    const contactWhere: Prisma.CrmContactWhereInput = { ...ownerFilter };
    const oppWhere: Prisma.CrmOpportunityWhereInput = { ...ownerFilter };
    if (createdAtFilter) {
      orgWhere.createdAt = createdAtFilter;
      contactWhere.createdAt = createdAtFilter;
      oppWhere.createdAt = createdAtFilter;
    }

    const [organisations, contacts, opportunities] = await Promise.all([
      this.prisma.crmOrganisation.findMany({
        where: orgWhere,
        select: { ownerUserId: true },
      }),
      this.prisma.crmContact.findMany({
        where: contactWhere,
        select: { ownerUserId: true },
      }),
      this.prisma.crmOpportunity.findMany({
        where: oppWhere,
        select: { ownerUserId: true, stage: true },
      }),
    ]);

    // WON deals are counted/valued by wonAt (when the deal closed), not createdAt.
    const wonWhere: Prisma.CrmOpportunityWhereInput = {
      ...ownerFilter,
      stage: OpportunityStage.WON,
    };
    const wonAtFilter = this.dateFilter(query.from, query.to);
    if (wonAtFilter) {
      wonWhere.wonAt = wonAtFilter;
    }
    const won = await this.prisma.crmOpportunity.findMany({
      where: wonWhere,
      select: { ownerUserId: true, estimatedValue: true },
    });

    // Aggregate per owner, then fold into an overall total.
    const perOwner = new Map<string | null, ConversionMetrics>();
    const rowFor = (ownerUserId: string | null): ConversionMetrics => {
      let row = perOwner.get(ownerUserId);
      if (!row) {
        row = {
          ownerUserId,
          organisations: 0,
          contacts: 0,
          opportunities: 0,
          won: 0,
          lost: 0,
          valueWon: 0,
          conversionRate: 0,
        };
        perOwner.set(ownerUserId, row);
      }
      return row;
    };

    for (const org of organisations) {
      rowFor(org.ownerUserId).organisations += 1;
    }
    for (const contact of contacts) {
      rowFor(contact.ownerUserId).contacts += 1;
    }
    for (const opp of opportunities) {
      const row = rowFor(opp.ownerUserId);
      row.opportunities += 1;
      if (opp.stage === OpportunityStage.LOST) {
        row.lost += 1;
      }
    }
    for (const deal of won) {
      const row = rowFor(deal.ownerUserId);
      row.won += 1;
      row.valueWon += this.decimalToNumber(deal.estimatedValue);
    }

    const owners = [...perOwner.values()].map((row) => this.withConversionRate(row));

    const overall = this.withConversionRate(
      owners.reduce<ConversionMetrics>(
        (acc, row) => ({
          ownerUserId: null,
          organisations: acc.organisations + row.organisations,
          contacts: acc.contacts + row.contacts,
          opportunities: acc.opportunities + row.opportunities,
          won: acc.won + row.won,
          lost: acc.lost + row.lost,
          valueWon: acc.valueWon + row.valueWon,
          conversionRate: 0,
        }),
        {
          ownerUserId: null,
          organisations: 0,
          contacts: 0,
          opportunities: 0,
          won: 0,
          lost: 0,
          valueWon: 0,
          conversionRate: 0,
        },
      ),
    );

    return { overall, owners };
  }

  /** conversionRate = won / (won + lost); 0 when nothing has closed. */
  private withConversionRate(row: ConversionMetrics): ConversionMetrics {
    const closed = row.won + row.lost;
    return { ...row, conversionRate: closed === 0 ? 0 : row.won / closed };
  }

  private dateFilter(from?: Date, to?: Date): Prisma.DateTimeFilter | undefined {
    if (!from && !to) {
      return undefined;
    }
    const filter: Prisma.DateTimeFilter = {};
    if (from) {
      filter.gte = from;
    }
    if (to) {
      filter.lte = to;
    }
    return filter;
  }

  private decimalToNumber(value: Prisma.Decimal | null): number {
    return value === null ? 0 : Number(value);
  }
}
