import { Module } from "@nitrostack/core";
import { PortfolioTools } from "./tools.js";

@Module({
  name: "PortfolioModule",
  controllers: [PortfolioTools],
})
export class AppModule {}
