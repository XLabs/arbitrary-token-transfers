import { AnchorError } from '@coral-xyz/anchor';
import { assert } from './utils/helpers';

describe('promise failure helper', () => {
  it('Fails when promise resolves', (done) => {
    const promise = Promise.resolve('ok');

    assert
      .promise(promise)
      .fails(AnchorError)
      .then(() => done(new Error('The promise did not fail')))
      .catch(() => done());
  });

  it('Succeeds when promise fails with the right error type', (done) => {
    const promise = Promise.reject(new AnchorError({ code: '123', number: 123 }, 'oops', [], []));

    assert
      .promise(promise)
      .fails(AnchorError)
      .then(() => done())
      .catch(() => done(new Error('The promise did not fail as expected')));
  });

  it('Fails when promise fails with a wrong error type', (done) => {
    const promise = Promise.reject(new Error('wrong error'));

    assert
      .promise(promise)
      .fails(AnchorError)
      .then(() => done(new Error('The promise did not fail')))
      .catch(() => done());
  });

  it('Succeeds when promise fails and error type is unspecified', (done) => {
    const promise = Promise.reject(new Error('wrong error'));

    assert
      .promise(promise)
      .fails()
      .then(() => done())
      .catch(() => done(new Error('The promise did not fail as expected')));
  });
});
