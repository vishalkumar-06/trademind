import { Module } from "@nitrostack/core";
import { RiskEngineTools } from "./tools.js";

@Module({
  name: "RiskEngineModule",
  controllers: [RiskEngineTools],
})
export class AppModule {}
