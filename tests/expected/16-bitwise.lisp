(defun popcount (x)
  (let* ((count 0))
    (loop while (/= x 0) do
      (incf count (logand x 1))
      (setf x (ash x -1)))
    count))

(defun main ()
  (let* ((a 90)
         (b 15))
    (format t
            "a & b = ~d, a | b = ~d, a ^ b = ~d~%"
            (logand a b)
            (logior a b)
            (logxor a b))
    (format t
            "~~a = ~d, a << 3 = ~d, -20 >> 2 = ~d~%"
            (lognot a)
            (ash a 3)
            (ash -20 -2))
    (format t "a in binary: ")
    (loop for i from 7 downto 0 do
      (format t "~d" (logand (ash a (- i)) 1)))
    (format t "~%Bits set in 255: ~d~%" (popcount 255))))

(main)
