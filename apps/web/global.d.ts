import type messages from "./messages/en.json";

// A missing or misspelled translation key is a type error.
declare module "next-intl" {
  interface AppConfig {
    Messages: typeof messages;
  }
}
