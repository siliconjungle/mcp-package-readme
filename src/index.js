import { SpecServer }          from './generic-spec-server.js';
import packageReadmeSpec       from './package-readme-spec.js';

await new SpecServer(packageReadmeSpec).start();
