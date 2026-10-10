import requests

resp = requests.post('http://127.0.0.1:8000/api/auth/login', json={'email': 'teacher@englishlife.uz', 'password': 'ChangeMe123!'})
print(resp.status_code)
print(resp.text)

if resp.ok:
    token = resp.json()['access_token']
    dashboard = requests.get('http://127.0.0.1:8000/api/dashboard/teacher', headers={'Authorization': 'Bearer ' + token})
    print(dashboard.status_code)
    print(dashboard.text[:1000])
