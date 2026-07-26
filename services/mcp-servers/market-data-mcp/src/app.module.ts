import { Module } from "@nitrostack/core";
import { MarketDataTools } from "./tools.js";

@Module({
  name: "MarketDataModule",
  controllers: [MarketDataTools],
})
export class AppModule {}
