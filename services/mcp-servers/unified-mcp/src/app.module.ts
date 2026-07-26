import { Module } from "@nitrostack/core";
import { PortfolioTools } from "@trademind/portfolio-mcp";
import { MarketDataTools } from "@trademind/market-data-mcp";
import { RiskEngineTools } from "@trademind/risk-engine-mcp";
import { TradeRecordsTools } from "@trademind/trade-records-mcp";
import { ComplianceDbTools } from "@trademind/compliance-db-mcp";
import { SlackTools } from "@trademind/slack-mcp";

@Module({
  name: "UnifiedTradeMindModule",
  controllers: [
    PortfolioTools,
    MarketDataTools,
    RiskEngineTools,
    TradeRecordsTools,
    ComplianceDbTools,
    SlackTools,
  ],
})
export class UnifiedAppModule {}
