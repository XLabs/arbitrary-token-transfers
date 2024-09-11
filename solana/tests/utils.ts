import { AnchorError } from "@coral-xyz/anchor";
import { assertResolveFailure } from "./utils/helpers.js";
import { describe } from "mocha";

describe("promise failure helper", () => {
  it("Fails when promise resolves", (done) => {
    const promise = Promise.resolve("ok");

    assertResolveFailure(promise, AnchorError)
      .then(() => done(new Error("The promise did not fail")))
      .catch(() => done());
  });

  it("Succeeds when promise fails with the right error type", (done) => {
    const promise = Promise.reject(new AnchorError({ code: "123", number: 123 }, "oops", [], []));

    assertResolveFailure(promise, AnchorError)
      .then(() => done())
      .catch(() => done(new Error("The promise did not fail as expected")));
  });

  it("Fails when promise fails with a wrong error type", (done) => {
    const promise = Promise.reject(new Error("wrong error"));

    assertResolveFailure(promise, AnchorError)
      .then(() => done(new Error("The promise did not fail")))
      .catch(() => done());
  });

  it("Succeeds when promise fails and error type is unspecified", (done) => {
    const promise = Promise.reject(new Error("wrong error"));

    assertResolveFailure(promise)
      .then(() => done())
      .catch(() => done(new Error("The promise did not fail as expected")));
  });
});
