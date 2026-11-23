import apiClient from './client.js'

export async function getHealth() {
  const { data } = await apiClient.get('/api/health')
  return data
}
