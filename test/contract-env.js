/**
 * Jest environment for contract tests: the React Native environment plus a handle to the
 * host Node's real fetch, which Expo's runtime otherwise replaces with its native fetch.
 */
const RNEnvironment = require('@react-native/jest-preset/jest/react-native-env.js');

module.exports = class ContractEnvironment extends RNEnvironment {
  constructor(config, context) {
    super(config, context);
    this.global.__hostFetch = fetch;
    this.global.__hostFormData = FormData;
    this.global.__hostBlob = Blob;
  }
};
