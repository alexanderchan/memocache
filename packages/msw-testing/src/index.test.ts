import { describe, expect, it } from 'vitest'
import {
	convertLogItemToCode,
	createMswFileLogger,
	createMswRecorderHandler,
	disableNetConnectHandler,
} from './index'

describe('@alexmchan/msw-testing entrypoint', () => {
	it('exposes its public API', () => {
		expect(disableNetConnectHandler).toBeDefined()
		expect(convertLogItemToCode).toBeInstanceOf(Function)
		expect(createMswFileLogger).toBeInstanceOf(Function)
		expect(createMswRecorderHandler).toBeInstanceOf(Function)
	})
})
