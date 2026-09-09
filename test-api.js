#!/usr/bin/env node

import http from 'http';
import { URL } from 'url';

const API_URL = 'http://localhost:3000/api';
let passed = 0;
let failed = 0;
let token = '';
let userId = '';
let offerId = '';

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL + path);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: null
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test(name, method, path, body = null, headers = {}) {
  try {
    const res = await makeRequest(method, path, body, headers);
    if (res.status >= 200 && res.status < 400) {
      console.log(`[OK] ${name}`);
      passed++;
      return res.data;
    } else {
      console.log(`[FAIL] ${name} (${res.status})`);
      failed++;
      return null;
    }
  } catch (e) {
    console.log(`[FAIL] ${name} - ${e.message}`);
    failed++;
    return null;
  }
}

async function runTests() {
  console.log('\nFITCV API Testing Suite');
  console.log('============================\n');

  // 1. Auth Tests
  console.log('AUTHENTICATION TESTS\n');
  const email = `test-${Math.random().toString(36).substring(7)}@example.com`;

  let regResp = await test('Register User', 'POST', '/auth/register', {
    email,
    password: 'TestPass123!'
  });
  if (regResp?.accessToken) token = regResp.accessToken;
  if (regResp?.user?.id) userId = regResp.user.id;

  if (token) {
    await test('Login User', 'POST', '/auth/login', { email, password: 'TestPass123!' });
  }

  console.log('\nCV OPERATIONS TESTS\n');

  const cvContent = `Senior Data Analyst with 6 years experience in AWS, Python, and SQL.
Expertise in building dashboards and analyzing large datasets.
Leadership experience mentoring 5+ junior analysts.
Strong SQL and Python skills. Experience with large datasets and cloud analytics.`;

  if (token) {
    await test('Upload CV', 'POST', '/cv/upload', { cvContent, fullName: 'Test User' }, {
      'Authorization': `Bearer ${token}`
    });

    let profileResp = await test('Get Profile', 'GET', '/cv/profile', null, {
      'Authorization': `Bearer ${token}`
    });

    await test('Suggest Roles', 'POST', '/cv/suggest-roles', {}, {
      'Authorization': `Bearer ${token}`
    });

    await test('List Roles', 'GET', '/cv/roles', null, {
      'Authorization': `Bearer ${token}`
    });
  }

  console.log('\nJOB OFFERS TESTS\n');

  if (token) {
    let offersResp = await test('List Offers', 'GET', '/offers?limit=5', null, {
      'Authorization': `Bearer ${token}`
    });
    if (offersResp?.data?.[0]?.id) offerId = offersResp.data[0].id;

    if (offerId) {
      await test('Get Offer Details', 'GET', `/offers/${offerId}`, null, {
        'Authorization': `Bearer ${token}`
      });
    }

    await test('Dashboard Stats', 'GET', '/offers/stats/summary', null, {
      'Authorization': `Bearer ${token}`
    });
  }

  console.log('\nPOSTULATIONS TESTS\n');

  if (token && offerId) {
    let postResp = await test('Create Postulation', 'POST', '/postulations', {
      offerId,
      priority: 'HIGH',
      notes: 'Test postulation'
    }, {
      'Authorization': `Bearer ${token}`
    });

    await test('List Postulations', 'GET', '/postulations', null, {
      'Authorization': `Bearer ${token}`
    });
  }

  console.log('\nERROR HANDLING TESTS\n');

  try {
    const res = await makeRequest('GET', '/cv/profile');
    if (res.status === 401) {
      console.log('[OK] Missing Token (401)');
      passed++;
    } else {
      console.log('[FAIL] Missing Token (expected 401, got ' + res.status + ')');
      failed++;
    }
  } catch (e) {
    console.log('[FAIL] Missing Token - ' + e.message);
    failed++;
  }

  if (token) {
    try {
      const res = await makeRequest('POST', '/postulations', { offerId: 'invalid' }, {
        'Authorization': `Bearer ${token}`
      });
      if (res.status === 400) {
        console.log('[OK] Invalid Data (400)');
        passed++;
      } else {
        console.log('[FAIL] Invalid Data (expected 400, got ' + res.status + ')');
        failed++;
      }
    } catch (e) {
      console.log('[FAIL] Invalid Data - ' + e.message);
      failed++;
    }

    try {
      const res = await makeRequest('GET', '/offers/nonexistent', null, {
        'Authorization': `Bearer ${token}`
      });
      if (res.status === 404) {
        console.log('[OK] Not Found (404)');
        passed++;
      } else {
        console.log('[FAIL] Not Found (expected 404, got ' + res.status + ')');
        failed++;
      }
    } catch (e) {
      console.log('[FAIL] Not Found - ' + e.message);
      failed++;
    }
  }

  console.log('\n\nTEST RESULTS SUMMARY');
  console.log('========================\n');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);

  if (failed === 0 && passed > 0) {
    console.log('ALL TESTS PASSED!');
  } else {
    console.log('Some tests failed.');
  }
}

runTests().catch(console.error);
