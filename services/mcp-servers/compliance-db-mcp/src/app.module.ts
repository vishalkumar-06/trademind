import { Module } from "@nitrostack/core";
import { ComplianceDbTools } from "./tools.js";

@Module({
  name: "ComplianceDbModule",
  controllers: [ComplianceDbTools],
})
export class AppModule {}
