import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { receiptDisposition } from './receiptDisposition';
test('missing or processed receipt never authorizes retry', () => { for (const s of [null, undefined, {err:null,confirmationStatus:'processed'}, {err:null}]) assert.equal(receiptDisposition(s),'unresolved'); });
test('confirmed and finalized successful receipts are distinguished', () => { for (const confirmationStatus of ['confirmed','finalized']) assert.equal(receiptDisposition({err:null,confirmationStatus}),'confirmed'); });
test('chain rejection is never classified as successful', () => { assert.equal(receiptDisposition({err:{InstructionError:[0,'Custom']},confirmationStatus:'finalized'}),'failed'); });
