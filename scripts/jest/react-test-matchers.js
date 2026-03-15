'use strict';

const SchedulerMatchers = require('./scheduler-test-matchers');

function captureAssertion(fn) {
  try {
    fn();
  } catch (error) {
    return {
      pass: false,
      message: () => error.message
    };
  }
  return { pass: true };
}

function toMatchRenderedOutput(ReactNoop, expectedJSX) {
  return captureAssertion(() => {
    expect(ReactNoop.getChildrenAsJSX()).toEqual(expectedJSX);
  });
}

module.exports = {
  ...SchedulerMatchers,
  toMatchRenderedOutput
};
