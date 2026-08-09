import type { Matrix2D, Point, Transform2D } from './document/types'

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) throw new Error(`${field} must be finite`)
}

export function transformToMatrix(transform: Transform2D): Matrix2D {
  assertFinite(transform.translateX, 'transform.translateX')
  assertFinite(transform.translateY, 'transform.translateY')
  assertFinite(transform.rotation, 'transform.rotation')
  assertFinite(transform.scaleX, 'transform.scaleX')
  assertFinite(transform.scaleY, 'transform.scaleY')
  const cosine = Math.cos(transform.rotation)
  const sine = Math.sin(transform.rotation)
  return Object.freeze({
    a: cosine * transform.scaleX,
    b: sine * transform.scaleX,
    c: -sine * transform.scaleY,
    d: cosine * transform.scaleY,
    e: transform.translateX,
    f: transform.translateY,
  })
}

export function multiplyMatrices(left: Matrix2D, right: Matrix2D): Matrix2D {
  for (const [field, value] of Object.entries({ ...left, ...right })) {
    assertFinite(value, `matrix.${field}`)
  }
  return Object.freeze({
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  })
}

export function invertMatrix(matrix: Matrix2D): Matrix2D {
  for (const [field, value] of Object.entries(matrix)) {
    assertFinite(value, `matrix.${field}`)
  }
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  if (determinant === 0) throw new Error('matrix is not invertible')
  return Object.freeze({
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  })
}

export function transformPoint(matrix: Matrix2D, point: Point): Point {
  for (const [field, value] of Object.entries(matrix)) {
    assertFinite(value, `matrix.${field}`)
  }
  assertFinite(point.x, 'point.x')
  assertFinite(point.y, 'point.y')
  return Object.freeze({
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  })
}
