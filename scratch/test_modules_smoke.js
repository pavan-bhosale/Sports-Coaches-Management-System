const http = require('http');

const endpoints = [
  { name: 'Students', path: '/VAVA_sports/server/students.php' },
  { name: 'Coaches', path: '/VAVA_sports/server/coaches.php' },
  { name: 'Batches', path: '/VAVA_sports/server/batches.php' },
  { name: 'Attendance', path: '/VAVA_sports/server/attendance.php' },
  { name: 'Fees', path: '/VAVA_sports/server/fees.php?action=get_fees&month=&batch_id=all&status=all&search=&sort=name' },
  { name: 'Inventory', path: '/VAVA_sports/server/inventory.php' },
  { name: 'Reports', path: '/VAVA_sports/server/reports.php?action=filter_options' },
  { name: 'Dashboard', path: '/VAVA_sports/server/dashboard.php' }
];

async function checkEndpoint(ep) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 80,
      path: ep.path,
      method: 'GET',
      headers: {
        'X-VAVA-Role': 'admin',
        'X-VAVA-Email': 'pavanbhosale212@gmail.com'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let isJson = false;
        try {
          JSON.parse(data);
          isJson = true;
        } catch(e) {}
        resolve({
          name: ep.name,
          status: res.statusCode,
          isJson: isJson,
          length: data.length
        });
      });
    });

    req.on('error', err => {
      resolve({ name: ep.name, status: 0, error: err.message });
    });

    req.end();
  });
}

(async () => {
  console.log('--- MODULES SMOKE TEST ---');
  for (const ep of endpoints) {
    const res = await checkEndpoint(ep);
    console.log(`${res.name.padEnd(15)} | HTTP ${res.status} | JSON: ${res.isJson} | Size: ${res.length} bytes`);
  }
})();
