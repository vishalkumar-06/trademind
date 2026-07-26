import { Module } from "@nitrostack/core";
import { TradeRecordsTools } from "./tools.js";

@Module({
  name: "TradeRecordsModule",
  controllers: [TradeRecordsTools],
})
export class AppModule {}
