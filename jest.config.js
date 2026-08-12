module.exports = {
  preset: '@react-native/jest-preset',
  modulePathIgnorePatterns: [
    '<rootDir>/example/node_modules',
    '<rootDir>/lib/',
  ],
  testPathIgnorePatterns: ['<rootDir>/example/', '<rootDir>/lib/'],
};
