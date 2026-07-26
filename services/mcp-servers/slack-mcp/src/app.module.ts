import { Module } from "@nitrostack/core";
import { SlackTools } from "./tools.js";

@Module({
  name: "SlackModule",
  controllers: [SlackTools],
})
export class AppModule {}
